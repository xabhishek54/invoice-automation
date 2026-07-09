import { Page } from 'playwright';
import { SELECTORS } from './selectors';
import { AutomationLogger } from './logger';

export interface AutomationInvoiceData {
  id: string;
  supplier_name: string;
  supplier_pan: string;
  bill_number: number;
  miti_bs: string;
  taxable_amount: number;
  non_taxable_amount?: number;
}

export async function processInvoice(
  page: Page,
  invoice: AutomationInvoiceData,
  logger: AutomationLogger,
  entryUrl?: string
): Promise<void> {
  logger.info(`Starting automation for Invoice: ID=${invoice.id}, Bill=${invoice.bill_number}, Supplier=${invoice.supplier_name}`);

  const hasTaxable = invoice.taxable_amount > 0;
  const hasNonTaxable = invoice.non_taxable_amount !== undefined && invoice.non_taxable_amount > 0;

  if (!hasTaxable && !hasNonTaxable) {
    throw new Error('Invoice has neither Taxable Amount nor Non-Taxable Amount greater than 0.');
  }

  // 1. Process Taxable amount entry if present
  if (hasTaxable) {
    logger.info(`Processing Taxable entry ("Purchase With Tax") for Rs. ${invoice.taxable_amount}`);
    await submitSinglePurchaseEntry(
      page,
      invoice,
      'Purchase With Tax',
      invoice.taxable_amount,
      logger,
      entryUrl
    );
  }

  // 2. Process Non-Taxable amount entry if present
  if (hasNonTaxable) {
    logger.info(`Processing Non-Taxable entry ("Purchase Non Taxable") for Rs. ${invoice.non_taxable_amount}`);
    await submitSinglePurchaseEntry(
      page,
      invoice,
      'Purchase Non Taxable',
      invoice.non_taxable_amount!,
      logger,
      entryUrl
    );
  }

  logger.info('Invoice sync completed successfully on Khatacloud ERP.');
}

async function submitSinglePurchaseEntry(
  page: Page,
  invoice: AutomationInvoiceData,
  itemName: string,
  amount: number,
  logger: AutomationLogger,
  entryUrl?: string
): Promise<void> {
  // Navigate to purchase invoice page
  const targetUrl = entryUrl || SELECTORS.purchaseInvoice.url;
  logger.info(`Navigating to Purchase Invoice page: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'load' });
  await page.waitForTimeout(1500); // Allow JavaScript to boot up

  // 1. Fill BS Date (Miti)
  logger.info(`Filling Date (BS): ${invoice.miti_bs}`);
  await page.click(SELECTORS.purchaseInvoice.dateInput);
  await page.fill(SELECTORS.purchaseInvoice.dateInput, '');
  await page.type(SELECTORS.purchaseInvoice.dateInput, invoice.miti_bs, { delay: 50 });
  await page.press(SELECTORS.purchaseInvoice.dateInput, 'Tab');

  // 2. Fill Supplier PAN and Select Option
  logger.info(`Entering Supplier PAN: ${invoice.supplier_pan}`);
  await page.click(SELECTORS.purchaseInvoice.supplierInput);
  await page.fill(SELECTORS.purchaseInvoice.supplierInput, '');
  await page.type(SELECTORS.purchaseInvoice.supplierInput, invoice.supplier_pan, { delay: 100 });

  logger.info('Waiting for supplier autocomplete options...');
  await page.waitForSelector(SELECTORS.purchaseInvoice.supplierOptionFirst, { state: 'visible', timeout: 8000 });
  
  const supplierNameOnPage = await page.textContent(SELECTORS.purchaseInvoice.supplierOptionFirst);
  logger.info(`Selecting supplier from dropdown: ${supplierNameOnPage?.trim()}`);
  await page.click(SELECTORS.purchaseInvoice.supplierOptionFirst);

  // 3. Fill Supplier No (Bill Number)
  logger.info(`Filling Supplier No with Bill Number: ${invoice.bill_number}`);
  await page.fill(SELECTORS.purchaseInvoice.billNumberInput, String(invoice.bill_number));
  await page.press(SELECTORS.purchaseInvoice.billNumberInput, 'Tab');

  // 4. Fill Item Name and Select option
  logger.info(`Entering Item Name: "${itemName}"...`);
  await page.click(SELECTORS.purchaseInvoice.itemInput);
  await page.fill(SELECTORS.purchaseInvoice.itemInput, '');
  await page.type(SELECTORS.purchaseInvoice.itemInput, itemName, { delay: 100 });

  logger.info('Waiting for item autocomplete options...');
  await page.waitForSelector(SELECTORS.purchaseInvoice.itemOptionFirst, { state: 'visible', timeout: 8000 });
  await page.click(SELECTORS.purchaseInvoice.itemOptionFirst);
  await page.waitForTimeout(1000); // Wait for Angular to fetch item details & default rate

  // 5. Quantity (Set to 1)
  logger.info('Setting Quantity to 1...');
  await page.click(SELECTORS.purchaseInvoice.quantityInput);
  await page.fill(SELECTORS.purchaseInvoice.quantityInput, '');
  await page.type(SELECTORS.purchaseInvoice.quantityInput, '1', { delay: 50 });
  await page.press(SELECTORS.purchaseInvoice.quantityInput, 'Tab');

  // 6. Rate (Set to Amount)
  logger.info(`Setting Rate: Rs. ${amount}`);
  await page.click(SELECTORS.purchaseInvoice.rateInput);
  await page.fill(SELECTORS.purchaseInvoice.rateInput, '');
  await page.type(SELECTORS.purchaseInvoice.rateInput, String(amount), { delay: 50 });
  await page.press(SELECTORS.purchaseInvoice.rateInput, 'Tab');

  // Wait a brief moment to ensure Angular calculates totals
  await page.waitForTimeout(500);

  // 7. Click Save & Continue
  logger.info('Clicking Save & Continue button...');
  await page.click(SELECTORS.purchaseInvoice.saveButton);

  // 8. Wait for save operation to finish and form to reload/reset
  logger.info('Waiting for save to complete and form to reset...');
  
  // Wait for the save button to be clickable again
  await page.waitForSelector(SELECTORS.purchaseInvoice.saveButton, { state: 'visible', timeout: 15000 });
  
  // Wait for the supplier input field to be empty (indicates form reset)
  await page.waitForFunction(
    `document.querySelector('input[name="customer_input"]') ? document.querySelector('input[name="customer_input"]').value === '' : true`,
    { timeout: 15000 }
  );

  logger.info(`Saved entry for "${itemName}" successfully.`);
}
