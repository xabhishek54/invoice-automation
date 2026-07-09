import { PrismaClient } from '@prisma/client';
import { BrowserService } from './browser';
import { loginToPortal } from './login';
import { processInvoice } from './purchaseInvoice';
import { AutomationLogger } from './logger';

const prisma = new PrismaClient();
const browserService = BrowserService.getInstance();

// Simple in-memory flag to prevent concurrent execution clashes on local browser
let isBatchRunning = false;

export async function runAutomationBatch(invoiceIds: string[], stopOnError: boolean = false, entryUrl?: string): Promise<void> {
  if (isBatchRunning) {
    console.warn('An automation batch is already running. Skipping trigger.');
    return;
  }

  isBatchRunning = true;
  const globalLogger = new AutomationLogger();
  globalLogger.info(`Starting batch run for ${invoiceIds.length} invoice(s)... (stopOnError: ${stopOnError}, entryUrl: ${entryUrl || 'default'})`);

  try {
    // 1. Initialize browser instance for the entire batch
    await browserService.startBrowser(globalLogger);
    const page = await browserService.getPage(globalLogger);

    // 2. Perform initial login (session check is built-in)
    await loginToPortal(page, globalLogger);

    // 3. Process each invoice sequentially
    for (const id of invoiceIds) {
      const invoiceLogger = new AutomationLogger();
      const startTime = new Date();
      invoiceLogger.info(`Processing invoice ${id} in batch...`);

      try {
        // Fetch fresh details from DB
        const invoice = await prisma.invoice.findUnique({ where: { id } });
        if (!invoice) {
          throw new Error('Invoice not found in database.');
        }

        if (invoice.status !== 'Verified' && invoice.status !== 'Automation Running') {
          throw new Error(`Invoice status is '${invoice.status}', but must be 'Verified'.`);
        }

        // Update DB status to Running
        await prisma.invoice.update({
          where: { id },
          data: {
            status: 'Automation Running',
            automation_started_at: startTime,
            automation_error: null,
            automation_log: invoiceLogger.getLogs()
          }
        });

        // Run Playwright form automation
        await processInvoice(page, invoice, invoiceLogger, entryUrl);

        // Update DB to Completed
        const finishTime = new Date();
        await prisma.invoice.update({
          where: { id },
          data: {
            status: 'Completed',
            automation_finished_at: finishTime,
            automation_log: invoiceLogger.getLogs()
          }
        });

      } catch (err: any) {
        const finishTime = new Date();
        invoiceLogger.error(`Error processing invoice ${id}: ${err.message}`);
        
        // Update DB to Failed
        await prisma.invoice.update({
          where: { id },
          data: {
            status: 'Failed',
            automation_error: err.message,
            automation_finished_at: finishTime,
            automation_log: invoiceLogger.getLogs()
          }
        }).catch(dbErr => console.error('Failed to log failure state to database:', dbErr));

        // If stopOnError is enabled, break the batch run
        if (stopOnError) {
          globalLogger.error(`Aborting remaining batch run because stopOnError is enabled and an error occurred on invoice ${id}.`);
          break;
        }
      }
    }

  } catch (globalErr: any) {
    globalLogger.error(`Critical batch automation failure: ${globalErr.message}`);
    // Attempt to mark remaining un-run invoices as failed
    for (const id of invoiceIds) {
      try {
        const inv = await prisma.invoice.findUnique({ where: { id } });
        if (inv && (inv.status === 'Verified' || inv.status === 'Automation Running')) {
          await prisma.invoice.update({
            where: { id },
            data: {
              status: 'Failed',
              automation_error: `Batch process failed: ${globalErr.message}`,
              automation_finished_at: new Date()
            }
          });
        }
      } catch (e) {}
    }
  } finally {
    // 4. Close the browser session at the end of the batch
    await browserService.closeBrowser(globalLogger);
    isBatchRunning = false;
    globalLogger.info('Batch run execution completed.');
  }
}

export function isAutomationRunning(): boolean {
  return isBatchRunning;
}
