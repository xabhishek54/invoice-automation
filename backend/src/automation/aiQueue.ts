import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

/**
 * Appends a log entry to an invoice's automation_log field.
 */
async function appendInvoiceLog(id: string, logLine: string, isError = false) {
  try {
    const inv = await prisma.invoice.findUnique({ where: { id }, select: { automation_log: true } });
    const prevLog = inv?.automation_log || '';
    const prefix = isError ? '[ERROR]' : '[INFO]';
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0');
    const newLog = prevLog + `${prefix} ${timestamp} - ${logLine}\n`;
    await prisma.invoice.update({
      where: { id },
      data: { 
        automation_log: newLog,
        ...(isError ? { automation_error: logLine } : {})
      }
    });
  } catch (e: any) {
    console.error('🤖 [AI Queue] Failed to write log:', e.message);
  }
}

export class AIQueueWorker {
  private static instance: AIQueueWorker;
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private sentRequestTimestamps: number[] = [];

  private constructor() {}

  public static getInstance(): AIQueueWorker {
    if (!AIQueueWorker.instance) {
      AIQueueWorker.instance = new AIQueueWorker();
    }
    return AIQueueWorker.instance;
  }

  /**
   * Starts the background queue worker
   */
  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🤖 [AI Queue] Starting background AI extraction queue worker...');
    this.tick();
  }

  /**
   * Stops the background queue worker
   */
  public stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('🤖 [AI Queue] Stopped background AI extraction queue worker.');
  }

  /**
   * Queue tick loop
   */
  private async tick() {
    if (!this.isRunning) return;

    try {
      await this.processQueue();
    } catch (err: any) {
      console.error('🤖 [AI Queue] Critical error in queue worker cycle:', err.message);
    }

    // Tick again every 2 seconds
    if (this.isRunning) {
      this.timer = setTimeout(() => this.tick(), 2000);
    }
  }

  /**
   * Performs the main processing checks
   */
  private async processQueue() {
    // 1. Recover stuck invoices (stuck in 'AI Processing' for > 5 minutes)
    const timeoutMinutes = 5;
    const timeoutThreshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const stuckInvoices = await prisma.invoice.findMany({
      where: {
        status: 'AI Processing',
        updated_at: { lt: timeoutThreshold }
      }
    });

    for (const invoice of stuckInvoices) {
      console.warn(`🤖 [AI Queue] Invoice ${invoice.id} has been stuck in 'AI Processing' for > ${timeoutMinutes} minutes. Marking as AI Failed.`);
      await appendInvoiceLog(invoice.id, `AI extraction timed out after ${timeoutMinutes} minutes.`, true);
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'AI Failed',
        }
      });
    }

    // 2. Query pending extraction queue
    const pendingInvoices = await prisma.invoice.findMany({
      where: { status: 'Pending AI Extraction' },
      orderBy: { created_at: 'asc' } // FIFO: Process oldest uploads first
    });

    if (pendingInvoices.length === 0) {
      return;
    }

    // 3. Count invoices currently active in processing
    const activeCount = await prisma.invoice.count({
      where: { status: 'AI Processing' }
    });

    // 4. Retrieve settings from database configuration, fallback to env variables, then default limits
    const dbConcurrencySetting = await prisma.setting.findUnique({ where: { key: 'ai_concurrency' } });
    const dbRateLimitSetting = await prisma.setting.findUnique({ where: { key: 'ai_rate_limit' } });

    const maxConcurrency = dbConcurrencySetting 
      ? Number(dbConcurrencySetting.value) 
      : (Number(process.env.AI_CONCURRENCY) || 2);

    const maxRate = dbRateLimitSetting 
      ? Number(dbRateLimitSetting.value) 
      : (Number(process.env.AI_RATE_LIMIT) || 15);

    // Filter request timestamps to only include the last 60 seconds
    const now = Date.now();
    this.sentRequestTimestamps = this.sentRequestTimestamps.filter(t => now - t < 60000);

    // Calculate remaining capacities
    const activeSlots = maxConcurrency - activeCount;
    const rateSlots = maxRate - this.sentRequestTimestamps.length;
    const slotsAvailable = Math.max(0, Math.min(activeSlots, rateSlots));

    if (slotsAvailable === 0) {
      // Log status if queue is backed up
      if (pendingInvoices.length > 0) {
        console.log(
          `🤖 [AI Queue] Queue waiting... ` +
          `Active: ${activeCount}/${maxConcurrency} | ` +
          `Rate limit: ${this.sentRequestTimestamps.length}/${maxRate} req/min | ` +
          `Queued: ${pendingInvoices.length}`
        );
      }
      return;
    }

    // 5. Process available slots
    const invoicesToProcess = pendingInvoices.slice(0, slotsAvailable);
    for (const invoice of invoicesToProcess) {
      this.sentRequestTimestamps.push(Date.now());

      await appendInvoiceLog(invoice.id, `Queue slot allocated. Concurrency: ${activeCount + 1}/${maxConcurrency}.`);

      // Move database status to processing immediately to occupy a concurrency slot
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'AI Processing' }
      });
      await appendInvoiceLog(invoice.id, `Status updated to 'AI Processing'.`);

      const n8nExtractUrl = process.env.N8N_EXTRACT_WEBHOOK_URL;
      if (n8nExtractUrl) {
        const appUrl = process.env.APP_URL || 'http://localhost:5000';
        const imageUrl = invoice.image_path ? `${appUrl}/${invoice.image_path}` : null;

        await appendInvoiceLog(invoice.id, `Dispatching request payload to n8n extract webhook at: ${n8nExtractUrl}`);
        
        axios.post(n8nExtractUrl, {
          id: invoice.id,
          image_path: invoice.image_path,
          image_url: imageUrl
        })
        .then(async response => {
          console.log(`🤖 [AI Queue] Webhook trigger successful for invoice ${invoice.id}. Status code: ${response.status}`);
          await appendInvoiceLog(invoice.id, `n8n webhook responded successfully (Status ${response.status}). Waiting for Gemini extraction results...`);
        })
        .catch(async err => {
          console.error(`🤖 [AI Queue] Failed to call n8n webhook for invoice ${invoice.id}:`, err.message);
          await appendInvoiceLog(invoice.id, `Failed to trigger n8n extraction webhook: ${err.message}`, true);
          
          // Revert processing state to failed state
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: 'AI Failed' }
          }).catch(dbErr => console.error('🤖 [AI Queue] Database fail logging error:', dbErr));
        });
      } else {
        console.error(`🤖 [AI Queue] N8N_EXTRACT_WEBHOOK_URL is not defined. Marking ${invoice.id} as failed.`);
        await appendInvoiceLog(invoice.id, `N8N_EXTRACT_WEBHOOK_URL environment variable is missing.`, true);
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'AI Failed' }
        });
      }
    }
  }
}
