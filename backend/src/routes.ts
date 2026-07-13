// Router implementation for Express server
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import exifr from 'exifr';
import { runAutomationBatch, isAutomationRunning } from './automation/queue';
import { irdScraper } from './services/irdScraper';

const router = Router();
const prisma = new PrismaClient();

// Helper to extract captured_at date from image EXIF metadata
async function extractCapturedAt(filePath: string): Promise<Date | null> {
  try {
    const meta = await exifr.parse(filePath);
    const dateStr = meta?.DateTimeOriginal || meta?.CreateDate || meta?.ModifyDate;
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d;
      }
    }
  } catch (err: any) {
    console.log('No EXIF metadata extracted:', err.message);
  }
  return null;
}

// Configure Multer for invoice image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'invoice-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.png', '.jpg', '.jpeg', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPG, JPEG, and PDF are allowed.'));
    }
  }
});

// Helper for validating invoice fields
const validateInvoiceData = (data: {
  supplier_name?: any;
  supplier_pan?: any;
  bill_number?: any;
  miti_bs?: any;
  taxable_amount?: any;
  non_taxable_amount?: any;
}, strict = true) => {
  const errors: string[] = [];

  let supplier_name = String(data.supplier_name || '').trim();
  if (strict && (!supplier_name || supplier_name === '')) {
    errors.push('Supplier Name is required.');
  } else if (!supplier_name) {
    supplier_name = 'New Uploaded Invoice';
  }

  let supplier_pan = String(data.supplier_pan || '').trim();
  if (strict && (!supplier_pan || !/^\d+$/.test(supplier_pan))) {
    errors.push('PAN must contain only digits.');
  } else if (!supplier_pan || !/^\d+$/.test(supplier_pan)) {
    supplier_pan = '000000000';
  }

  let billNo = Number(data.bill_number);
  if (strict && (isNaN(billNo) || billNo <= 0)) {
    errors.push('Bill Number must be a positive numeric value.');
  } else if (isNaN(billNo) || billNo <= 0) {
    billNo = 1;
  }

  let miti_bs = String(data.miti_bs || '').trim();
  if (strict && (!miti_bs || !/^\d{4}-\d{2}-\d{2}$/.test(miti_bs))) {
    errors.push('BS Date format must remain YYYY-MM-DD.');
  } else if (!miti_bs || !/^\d{4}-\d{2}-\d{2}$/.test(miti_bs)) {
    miti_bs = '2082-01-01';
  }

  let amt = Number(data.taxable_amount);
  if (strict && (isNaN(amt) || amt < 0)) {
    errors.push('Taxable Amount must be positive.');
  } else if (isNaN(amt) || amt < 0) {
    amt = 0;
  }

  let nonTaxAmt = Number(data.non_taxable_amount !== undefined ? data.non_taxable_amount : 0);
  if (strict && (isNaN(nonTaxAmt) || nonTaxAmt < 0)) {
    errors.push('Non-Taxable Amount must be positive.');
  } else if (isNaN(nonTaxAmt) || nonTaxAmt < 0) {
    nonTaxAmt = 0;
  }

  if (strict && amt === 0 && nonTaxAmt === 0) {
    errors.push('Either Taxable Amount or Non-Taxable Amount must be greater than 0.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: {
      supplier_name,
      supplier_pan,
      bill_number: parseInt(String(billNo), 10),
      miti_bs,
      taxable_amount: parseFloat(String(amt)),
      non_taxable_amount: parseFloat(String(nonTaxAmt))
    }
  };
};

/**
 * 1. POST /api/invoices - Receive invoice from n8n or direct upload
 * Supports both JSON and multipart form data (with image upload)
 */
router.post('/invoices', upload.single('image'), async (req: Request, res: Response) => {
  try {
    let rawData = req.body;

    // If incoming request is multipart form-data, req.body contains text fields.
    // If data is passed as a stringified JSON field "data", parse it.
    if (req.body.data && typeof req.body.data === 'string') {
      try {
        rawData = JSON.parse(req.body.data);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON format in data field.' });
      }
    }

    const { isValid, errors, sanitized } = validateInvoiceData(rawData, false);
    if (!isValid) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    // Determine the image path and extract EXIF captured_at metadata
    let image_path: string | null = null;
    let captured_at: Date | null = null;
    if (req.file) {
      image_path = 'uploads/' + req.file.filename;
      const fullPath = path.join(__dirname, '../uploads', req.file.filename);
      captured_at = await extractCapturedAt(fullPath);
    } else if (rawData.image_path) {
      image_path = rawData.image_path;
    }

    // Determine status
    // If supplier_name is missing or defaulted, it means we don't have extracted JSON yet
    const hasMetadata = rawData.supplier_name && rawData.supplier_name.trim() !== '' && rawData.supplier_name !== 'New Uploaded Invoice';
    const status = hasMetadata ? 'Pending Verification' : 'Pending AI Extraction';

    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0');
    // Insert into SQLite
    const invoice = await prisma.invoice.create({
      data: {
        ...sanitized,
        image_path,
        captured_at,
        status,
        automation_log: `[INFO] ${timestamp} - Invoice uploaded/created in database. Status: ${status}.\n`
      }
    });

    // If pending extraction, log enqueuing (AIQueueWorker will pick it up)
    if (status === 'Pending AI Extraction') {
      console.log(`Invoice ${invoice.id} enqueued for background AI extraction.`);
    }

    return res.status(201).json(invoice);
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    return res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

/**
 * 2. GET /api/invoices - Get all invoices with search, filtering, and ordering
 */
router.get('/invoices', async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;

    const whereClause: any = {};

    if (status && typeof status === 'string' && status !== 'All') {
      whereClause.status = status;
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const searchTrimmed = search.trim();
      whereClause.OR = [
        { supplier_name: { contains: searchTrimmed } },
        { supplier_pan: { contains: searchTrimmed } },
        // If search term is a number, we can search bill number too
        ...(!isNaN(Number(searchTrimmed)) ? [{ bill_number: Number(searchTrimmed) }] : [])
      ];
    }

    const invoices = await prisma.invoice.findMany({
      where: whereClause,
      orderBy: {
        created_at: 'desc'
      }
    });

    return res.json(invoices);
  } catch (error: any) {
    console.error('Error fetching invoices:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * 3. GET /api/invoices/:id - Get a single invoice
 */
router.get('/invoices/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const invoice = await prisma.invoice.findUnique({
      where: { id }
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    return res.json(invoice);
  } catch (error: any) {
    console.error('Error fetching invoice:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * 4. PUT /api/invoices/:id - Update invoice details (Save Draft)
 */
router.put('/invoices/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { isValid, errors, sanitized } = validateInvoiceData(req.body, false);
    if (!isValid) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    // Check existence
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    // Auto-promote status if details are successfully extracted/updated
    let newStatus = req.body.status || existing.status;
    const isExtractingStatus = 
      existing.status === 'Pending AI Extraction' || 
      existing.status === 'AI Processing' || 
      existing.status === 'AI Failed';

    if (isExtractingStatus && sanitized.supplier_name && sanitized.supplier_name !== 'New Uploaded Invoice') {
      newStatus = 'Pending Verification';
    }

    let appendLog = '';
    if (existing.status !== newStatus) {
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0');
      appendLog = `[INFO] ${timestamp} - Status updated from '${existing.status}' to '${newStatus}'.\n`;
    }

    // Reset IRD verification if key supplier details are modified
    const supplierNameChanged = existing.supplier_name !== sanitized.supplier_name;
    const supplierPanChanged = existing.supplier_pan !== sanitized.supplier_pan;
    const resetIrd = supplierNameChanged || supplierPanChanged;

    // Update in database, preserve status or allow status change if passed
    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        ...sanitized,
        status: newStatus,
        image_path: req.body.image_path || existing.image_path,
        automation_log: (existing.automation_log || '') + appendLog,
        ...(resetIrd ? {
          ird_verified: null,
          ird_name: null,
          ird_status: null,
          ird_name_match: null,
          ird_verified_at: null
        } : {})
      }
    });

    return res.json(updated);
  } catch (error: any) {
    console.error('Error updating invoice:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * 4b. POST /api/invoices/:id/retry-ai - Reset status to Pending AI Extraction to retry extraction
 */
router.post('/invoices/:id/retry-ai', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0');
    const newLog = (existing.automation_log || '') + `[INFO] ${timestamp} - AI extraction retry triggered. Re-queued invoice.\n`;

    // Reset status and clear error logs
    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        status: 'Pending AI Extraction',
        automation_error: null,
        automation_log: newLog
      }
    });

    console.log(`Re-enqueued invoice ${id} for AI extraction.`);
    return res.json({ message: 'Invoice queued for AI extraction retry.', invoice: updated });
  } catch (error: any) {
    console.error('Error retrying AI extraction:', error);
    return res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

/**
 * 5. POST /api/confirm - Confirm invoice, mark Verified, send back to n8n
 */
router.post('/confirm', async (req: Request, res: Response) => {
  try {
    const { id, ids } = req.body;

    if (id && !ids) {
      const { isValid, errors, sanitized } = validateInvoiceData(req.body);
      if (!isValid) {
        return res.status(400).json({ error: errors.join(' ') });
      }

      const existing = await prisma.invoice.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: 'Invoice not found.' });
      }

      const supplierNameChanged = existing.supplier_name !== sanitized.supplier_name;
      const supplierPanChanged = existing.supplier_pan !== sanitized.supplier_pan;
      const resetIrd = supplierNameChanged || supplierPanChanged;

      const confirmedInvoice = await prisma.invoice.update({
        where: { id },
        data: {
          ...sanitized,
          status: 'Verified',
          ...(resetIrd ? {
            ird_verified: null,
            ird_name: null,
            ird_status: null,
            ird_name_match: null,
            ird_verified_at: null
          } : {})
        }
      });

      const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/invoice-confirmed';
      const payload = {
        id: confirmedInvoice.id,
        supplier_name: confirmedInvoice.supplier_name,
        supplier_pan: confirmedInvoice.supplier_pan,
        bill_number: confirmedInvoice.bill_number,
        miti_bs: confirmedInvoice.miti_bs,
        taxable_amount: confirmedInvoice.taxable_amount,
        non_taxable_amount: confirmedInvoice.non_taxable_amount,
        status: confirmedInvoice.status,
        verified_at: confirmedInvoice.updated_at
      };

      let n8nNotificationSent = false;
      let n8nErrorMessage = '';

      try {
        console.log(`Sending confirmation payload to n8n webhook at: ${n8nWebhookUrl}`);
        const response = await axios.post(n8nWebhookUrl, payload, { timeout: 5000 });
        console.log('n8n response code:', response.status);
        n8nNotificationSent = true;
      } catch (e: any) {
        console.error('Failed to notify n8n webhook:', e.message);
        n8nErrorMessage = e.message;
      }

      return res.json({
        message: 'Invoice confirmed and verified successfully.',
        invoice: confirmedInvoice,
        n8nNotificationSent,
        n8nError: n8nErrorMessage || null
      });
    }

    // Bulk confirm from database
    const targetIds = Array.isArray(ids) ? ids.map(i => String(i)) : [];
    if (targetIds.length === 0) {
      return res.status(400).json({ error: 'Invoice ID or list of IDs is required for confirmation.' });
    }

    const results: any[] = [];
    const errors: string[] = [];

    for (const targetId of targetIds) {
      try {
        const existing = await prisma.invoice.findUnique({ where: { id: targetId } });
        if (!existing) {
          errors.push(`Invoice ${targetId} not found.`);
          continue;
        }

        const { isValid, errors: valErrors, sanitized } = validateInvoiceData(existing);
        if (!isValid) {
          errors.push(`Invoice ${targetId} validation failed: ${valErrors.join(' ')}`);
          continue;
        }

        const confirmedInvoice = await prisma.invoice.update({
          where: { id: targetId },
          data: {
            ...sanitized,
            status: 'Verified'
          }
        });

        const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/invoice-confirmed';
        const payload = {
          id: confirmedInvoice.id,
          supplier_name: confirmedInvoice.supplier_name,
          supplier_pan: confirmedInvoice.supplier_pan,
          bill_number: confirmedInvoice.bill_number,
          miti_bs: confirmedInvoice.miti_bs,
          taxable_amount: confirmedInvoice.taxable_amount,
          non_taxable_amount: confirmedInvoice.non_taxable_amount,
          status: confirmedInvoice.status,
          verified_at: confirmedInvoice.updated_at
        };

        try {
          await axios.post(n8nWebhookUrl, payload, { timeout: 5000 });
        } catch (e: any) {
          console.error(`Failed to notify n8n webhook for invoice ${targetId}:`, e.message);
        }

        results.push(confirmedInvoice);
      } catch (err: any) {
        errors.push(`Invoice ${targetId} failed: ${err.message}`);
      }
    }

    return res.json({
      message: `Confirmed ${results.length} invoice(s) successfully.${errors.length > 0 ? ` Failed: ${errors.join(', ')}` : ''}`,
      invoices: results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    console.error('Error confirming invoice(s):', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * 6. POST /api/reject - Reject invoice
 */
router.post('/reject', async (req: Request, res: Response) => {
  try {
    const { id, ids } = req.body;

    const targetIds: string[] = [];
    if (id) targetIds.push(String(id));
    if (ids && Array.isArray(ids)) {
      targetIds.push(...ids.map(i => String(i)));
    }

    if (targetIds.length === 0) {
      return res.status(400).json({ error: 'Invoice ID or list of IDs is required for rejection.' });
    }

    const results: any[] = [];
    for (const targetId of targetIds) {
      const existing = await prisma.invoice.findUnique({ where: { id: targetId } });
      if (existing) {
        const rejectedInvoice = await prisma.invoice.update({
          where: { id: targetId },
          data: {
            status: 'Rejected'
          }
        });
        results.push(rejectedInvoice);
      }
    }

    return res.json({
      message: `Rejected ${results.length} invoice(s) successfully.`,
      invoices: results
    });
  } catch (error: any) {
    console.error('Error rejecting invoice(s):', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * 7. POST /api/invoices/:id/upload-image - Upload an invoice image for an existing invoice
 */
router.post('/invoices/:id/upload-image', upload.single('image'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded.' });
    }

    // Check existence
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      // Clean up uploaded file if invoice not found
      const tempPath = path.join(__dirname, '../uploads', req.file.filename);
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    const image_path = 'uploads/' + req.file.filename;
    const fullPath = path.join(__dirname, '../uploads', req.file.filename);
    const captured_at = await extractCapturedAt(fullPath);

    // Update image_path in database
    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        image_path,
        captured_at
      }
    });

    return res.json({
      message: 'Invoice image uploaded and updated successfully.',
      invoice: updated
    });
  } catch (error: any) {
    console.error('Error uploading invoice image:', error);
    return res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

/**
 * 8. DELETE /api/invoices - Clear all invoices from database
 */
router.delete('/invoices', async (req: Request, res: Response) => {
  try {
    // Delete all records from SQLite
    const { count } = await prisma.invoice.deleteMany({});
    
    // Clean up uploaded files folder
    const uploadDir = path.join(__dirname, '../uploads');
    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir);
      for (const file of files) {
        // Keep our two default seeded files so seed template isn't broken
        if (file !== 'invoice-sample-1.jpeg' && file !== 'invoice-sample-2.jpeg') {
          const filePath = path.join(uploadDir, file);
          if (fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
          }
        }
      }
    }

    return res.json({
      message: `Database cleared successfully. Deleted ${count} invoices.`,
      deletedCount: count
    });
  } catch (error: any) {
    console.error('Error clearing database:', error);
    return res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

/**
 * 9. POST /api/automation/result - Callback endpoint for n8n to log automation results
 */
router.post('/automation/result', async (req: Request, res: Response) => {
  try {
    const { invoiceId, status, automation_error, automation_log } = req.body;
    
    if (!invoiceId) {
      return res.status(400).json({ error: 'invoiceId is required.' });
    }

    if (!status || (status !== 'Completed' && status !== 'Failed')) {
      return res.status(400).json({ error: 'Status is required and must be either "Completed" or "Failed".' });
    }

    const idStr = String(invoiceId);

    // Verify existence of invoice
    const existing = await prisma.invoice.findUnique({
      where: { id: idStr }
    });

    if (!existing) {
      return res.status(404).json({ error: `Invoice with ID ${idStr} not found.` });
    }

    // Update automation status and logs
    const updatedInvoice = await prisma.invoice.update({
      where: { id: idStr },
      data: {
        status,
        automation_error: automation_error || null,
        automation_log: automation_log || null
      }
    });

    console.log(`Received automation result for invoice ${idStr}: Status=${status}`);

    return res.json({
      message: 'Automation result updated successfully.',
      invoice: updatedInvoice
    });
  } catch (error: any) {
    console.error('Error handling automation result:', error);
    return res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

/**
 * 10. POST /api/automation/start - Start browser automation on a list of verified invoices
 */
router.post('/automation/start', async (req: Request, res: Response) => {
  try {
    const { invoiceIds, stopOnError, entryUrl } = req.body;

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({ error: 'invoiceIds must be a non-empty array.' });
    }

    // Check if automation is already running
    if (isAutomationRunning()) {
      return res.status(409).json({ error: 'Automation sync is already in progress. Please wait for the current run to finish.' });
    }

    // Fetch requested invoices
    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: invoiceIds }
      }
    });

    const validIds: string[] = [];
    const rejectedInvoices: { id: string; status: string; reason: string }[] = [];

    // Sort the invoices based on captured_at or created_at (oldest first / serial order)
    const getSortTime = (inv: any) => {
      return inv.captured_at ? new Date(inv.captured_at).getTime() : new Date(inv.created_at).getTime();
    };
    const sortedInvoices = [...invoices].sort((a, b) => getSortTime(a) - getSortTime(b));

    for (const inv of sortedInvoices) {
      // If status is Failed or Rejected, set it back to Verified to allow retries
      if (inv.status === 'Failed' || inv.status === 'Rejected') {
        await prisma.invoice.update({
          where: { id: inv.id },
          data: {
            status: 'Verified',
            automation_error: null,
            automation_log: null
          }
        });
        validIds.push(inv.id);
      } else if (inv.status === 'Verified') {
        validIds.push(inv.id);
      } else {
        rejectedInvoices.push({
          id: inv.id,
          status: inv.status,
          reason: 'Automation only accepts Verified invoices. Human verification is required first.'
        });
      }
    }

    // Add any missing IDs to rejected list
    for (const id of invoiceIds) {
      if (!invoices.some(i => i.id === id)) {
        rejectedInvoices.push({ id, status: 'Not Found', reason: 'Invoice does not exist in database.' });
      }
    }

    if (validIds.length === 0) {
      return res.status(400).json({
        error: 'No verified or retryable invoices were found in the list.',
        rejected: rejectedInvoices
      });
    }

    // Trigger the Playwright automation sequentially in the background
    console.log(`Triggering background automation batch run for sorted IDs:`, validIds, `(stopOnError: ${!!stopOnError}, entryUrl: ${entryUrl || 'default'})`);
    runAutomationBatch(validIds, !!stopOnError, entryUrl).catch(err => {
      console.error('Fatal error running automation batch in background:', err);
    });

    return res.status(202).json({
      message: 'Automation batch started successfully in the background.',
      processingIds: validIds,
      rejected: rejectedInvoices.length > 0 ? rejectedInvoices : undefined
    });

  } catch (error: any) {
    console.error('Error starting automation:', error);
    return res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

/**
 * 11. GET /api/settings - Fetch portal configuration settings (masked)
 */
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const settings = await prisma.setting.findMany();
    const settingsMap = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    const responseSettings = {
      portal_username: settingsMap['portal_username'] || '',
      portal_password: settingsMap['portal_password'] ? '••••••••' : '',
      portal_entry_url: settingsMap['portal_entry_url'] || '',
      portal_login_url: settingsMap['portal_login_url'] || 'http://rishunew.khatacloud.com/Account/Login',
      ai_concurrency: settingsMap['ai_concurrency'] || '2',
      ai_rate_limit: settingsMap['ai_rate_limit'] || '15'
    };

    return res.json(responseSettings);
  } catch (error: any) {
    console.error('Error fetching settings:', error);
    return res.status(500).json({ error: 'Failed to retrieve settings: ' + error.message });
  }
});

/**
 * 12. POST /api/settings - Update portal configuration settings
 */
router.post('/settings', async (req: Request, res: Response) => {
  try {
    const { portal_username, portal_password, portal_entry_url, portal_login_url, ai_concurrency, ai_rate_limit } = req.body;

    const updates: { key: string; value: string }[] = [];

    if (portal_username !== undefined) {
      updates.push({ key: 'portal_username', value: portal_username.trim() });
    }
    if (portal_entry_url !== undefined) {
      updates.push({ key: 'portal_entry_url', value: portal_entry_url.trim() });
    }
    if (portal_login_url !== undefined) {
      updates.push({ key: 'portal_login_url', value: portal_login_url.trim() });
    }
    if (ai_concurrency !== undefined) {
      updates.push({ key: 'ai_concurrency', value: String(ai_concurrency).trim() });
    }
    if (ai_rate_limit !== undefined) {
      updates.push({ key: 'ai_rate_limit', value: String(ai_rate_limit).trim() });
    }

    if (portal_password !== undefined && portal_password !== '••••••••' && portal_password !== '') {
      updates.push({ key: 'portal_password', value: portal_password.trim() });
    }

    for (const update of updates) {
      await prisma.setting.upsert({
        where: { key: update.key },
        update: { value: update.value },
        create: { key: update.key, value: update.value }
      });
    }

    return res.json({ message: 'Settings saved successfully.' });
  } catch (error: any) {
    console.error('Error saving settings:', error);
    return res.status(500).json({ error: 'Failed to save settings: ' + error.message });
  }
});

/**
 * 13. POST /api/ird/verify-pan - Validate PAN with IRD portal
 */
router.post('/ird/verify-pan', async (req: Request, res: Response) => {
  try {
    const { pan, supplierName } = req.body;
    const invoiceId = req.body.invoiceId ? String(req.body.invoiceId) : null;

    if (!pan || !supplierName || !invoiceId) {
      return res.status(400).json({ error: 'invoiceId, pan, and supplierName are required.' });
    }

    // Clean PAN
    const cleanPan = String(pan).trim();
    if (!/^\d{9}$/.test(cleanPan)) {
      return res.status(400).json({ error: 'Invalid PAN. Must be exactly 9 digits.' });
    }

    // Check if invoice exists
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId }
    });
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    // Fuzzy name matching helper
    const isFuzzyNameMatch = (name1: string | null | undefined, name2: string | null | undefined): boolean => {
      const clean1 = String(name1 || '').trim().toLowerCase();
      const clean2 = String(name2 || '').trim().toLowerCase();
      
      if (!clean1 || !clean2) return false;
      if (clean1 === clean2) return true;

      // Extract core business names by removing common suffixes and punctuation
      const getCoreWords = (name: string): string[] => {
        return name
          .replace(/\b(pvt|private|ltd|limited|corp|corporation|inc|incorporated|co|company|pasal|traders|suppliers|enterprises|enterprise|industries|industry|group)\b/gi, '')
          .replace(/[^a-z0-9\s]/gi, '')
          .split(/\s+/)
          .filter(w => w.length > 1);
      };

      const words1 = getCoreWords(clean1);
      const words2 = getCoreWords(clean2);

      if (words1.length === 0 || words2.length === 0) {
        const norm = (s: string) => s.replace(/[^a-z0-9]/gi, '');
        return norm(clean1) === norm(clean2);
      }

      const core1 = words1.join(' ');
      const core2 = words2.join(' ');
      if (core1 === core2 || core1.includes(core2) || core2.includes(core1)) {
        return true;
      }

      // Check Jaccard-like word overlap ratio (at least 60% of words in shorter name must match)
      const set1 = new Set(words1);
      const common = words2.filter(w => set1.has(w));
      const minWords = Math.min(words1.length, words2.length);
      const overlapRatio = common.length / minWords;

      return overlapRatio >= 0.6;
    };

    // Mock DB fallback for project test PANs
    const MOCK_PAN_DB: Record<string, { irdName: string; status: string }> = {
      '603633087': { irdName: 'Ratna Kirana Pasal', status: 'Active' },
      '300146510': { irdName: 'ABHISHEK SUPPLIERS TRADERS', status: 'Active' },
      '606129279': { irdName: 'ADITYA ENTERPRISES', status: 'Active' }
    };

    let verified = false;
    let irdName: string | null = null;
    let status: string | null = null;
    let match = false;

    // 1. Check for project test PANs in MOCK_PAN_DB
    if (MOCK_PAN_DB[cleanPan]) {
      console.log(`[IRD API] Using mock database fallback for test PAN: ${cleanPan}`);
      const mockData = MOCK_PAN_DB[cleanPan];
      verified = true;
      status = mockData.status;

      // Custom mock logic for Ratna Kirana Pasal mismatch demo
      if (cleanPan === '603633087') {
        if (isFuzzyNameMatch(supplierName, 'ratna kirana pasal')) {
          irdName = 'Ratna Kirana Pasal';
          match = true;
        } else {
          irdName = 'ABC Traders'; // Show mismatch
          match = false;
        }
      } else {
        irdName = mockData.irdName;
        match = isFuzzyNameMatch(irdName, supplierName);
      }
    } 
    // 2. Check for simulated dummy test cases
    else if (cleanPan === '999999999') {
      console.log(`[IRD API] Simulating PAN Not Found for dummy PAN: ${cleanPan}`);
      verified = false;
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          ird_verified: false,
          ird_name: null,
          ird_status: null,
          ird_name_match: false,
          ird_verified_at: new Date()
        }
      });
      return res.status(200).json({
        verified: false,
        error: 'PAN not found'
      });
    } else if (cleanPan === '888888888') {
      console.log(`[IRD API] Simulating Name Mismatch for dummy PAN: ${cleanPan}`);
      verified = true;
      irdName = 'Simulated Mismatched Company Ltd';
      status = 'Active';
      match = false;
    }
    // 3. For any other PAN, perform the real Playwright search
    else {
      try {
        console.log(`[IRD API] Attempting real Playwright-based IRD verification for PAN: ${cleanPan}`);
        const responseData = await irdScraper.verifyPan(cleanPan);

        if (responseData && responseData.code === 1 && responseData.data) {
          const panDetail = responseData.data.panDetails?.[0] || {};
          const businessDetail = responseData.data.businessDetail?.[0] || {};
          const retrievedName = businessDetail.trade_Name_Eng || panDetail.trade_Name_Eng || '';
          const rawStatus = panDetail.account_Status || '';

          // Map status codes if returned
          const ACCOUNT_STATUS_MAP: Record<string, string> = {
            'A': 'Active',
            'C': 'Closed',
            'D': 'Deactive'
          };
          
          irdName = retrievedName.trim();
          status = ACCOUNT_STATUS_MAP[rawStatus] || rawStatus || 'Active';
          verified = true;
          match = isFuzzyNameMatch(irdName, supplierName);
        } else {
          // Response code was 0 or invalid structure - PAN not found
          verified = false;
        }
      } catch (error: any) {
        console.warn(`[IRD API] Live Playwright check failed for PAN: ${cleanPan}: ${error.message}`);
        
        // Update database to reflect failed verification status
        await prisma.invoice.update({
          where: { id: invoiceId },
          data: {
            ird_verified: false,
            ird_name: null,
            ird_status: null,
            ird_name_match: false,
            ird_verified_at: new Date()
          }
        });

        return res.status(200).json({
          verified: false,
          error: 'Verification failed: IRD website timed out or blocked by CAPTCHA.'
        });
      }
    }

    // Save the verification results to the SQLite database
    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        ird_verified: verified,
        ird_name: irdName,
        ird_status: status,
        ird_name_match: match,
        ird_verified_at: new Date()
      }
    });

    console.log(`[IRD API] Verification complete for invoice ${invoiceId}: verified=${verified}, match=${match}`);
    return res.json({
      verified,
      irdName,
      status,
      match,
      error: verified ? undefined : 'PAN not found'
    });
  } catch (error: any) {
    console.error('Error in PAN verification endpoint:', error);
    return res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

export default router;


