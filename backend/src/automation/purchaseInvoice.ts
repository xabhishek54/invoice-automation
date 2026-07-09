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

  const taxableAmount = invoice.taxable_amount || 0;
  const nonTaxableAmount = invoice.non_taxable_amount || 0;

  const hasTaxable = taxableAmount > 0;
  const hasNonTaxable = nonTaxableAmount > 0;

  if (!hasTaxable && !hasNonTaxable) {
    throw new Error('Invoice has neither Taxable Amount nor Non-Taxable Amount greater than 0.');
  }

  // 1. Process Taxable amount entry if present
  if (hasTaxable) {
    logger.info(`Processing Taxable entry ("Purchase With Tax") for Rs. ${taxableAmount}`);
    await submitSinglePurchaseEntry(
      page,
      invoice,
      'Purchase With Tax',
      taxableAmount,
      logger,
      entryUrl
    );
  }

  // 2. Process Non-Taxable amount entry if present
  if (hasNonTaxable) {
    logger.info(`Processing Non-Taxable entry ("Purchase Non Taxable") for Rs. ${nonTaxableAmount}`);
    await submitSinglePurchaseEntry(
      page,
      invoice,
      'Purchase Non Taxable',
      nonTaxableAmount,
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

  // Wait for Charge On table and default charges (like VAT ( +)) to load
  const currentUrl = page.url();
  const isMockPortal = currentUrl.includes('/mock-portal/');
  
  logger.info('Waiting for "Charge On" section/table and VAT ( +) checkbox to load...');
  try {
    const chargeOnRow = page.locator('text="VAT ( +)"').or(page.locator('text="Charge On"')).first();
    await chargeOnRow.waitFor({ state: 'visible', timeout: isMockPortal ? 1000 : 15000 });
    logger.info('"Charge On" / VAT section loaded on page.');
  } catch (e: any) {
    if (isMockPortal) {
      logger.info('Skipped waiting for VAT section since we are on the mock portal.');
    } else {
      logger.warn(`Could not locate "Charge On" section: ${e.message}. Continuing sync...`);
    }
  }
  // Wait a small timeout to let dynamic bindings register
  await page.waitForTimeout(1500);

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
  await page.waitForTimeout(1000);

  // Verify VAT and calculations for taxable entry
  if (itemName === 'Purchase With Tax') {
    logger.info('Verifying VAT ( +) checkbox is checked...');
    const vatRow = page.locator('tr:has-text("VAT ( +)")').first();
    if (await vatRow.count() > 0) {
      const checkbox = vatRow.locator('input[type="checkbox"]');
      if (await checkbox.count() > 0) {
        const isChecked = await checkbox.first().isChecked();
        if (!isChecked) {
          logger.info('VAT checkbox was not checked. Checking it now...');
          await checkbox.first().check();
          await page.waitForTimeout(1000); // Allow recalculation
        } else {
          logger.info('VAT checkbox is already checked.');
        }
      }
    }

    if (!isMockPortal) {
      logger.info('Checking if VAT amount is correctly calculated...');
      let vatVal = await getVatAmount(page, logger);
      
      if (vatVal <= 0) {
        logger.warn(`VAT amount was read as ${vatVal}. Attempting to trigger recalculation by clicking out and back...`);
        // Trigger a recalculation by focusing on rate and tab/enter
        await page.focus(SELECTORS.purchaseInvoice.rateInput);
        await page.press(SELECTORS.purchaseInvoice.rateInput, 'Enter');
        await page.waitForTimeout(1500);
        
        // Recheck VAT
        vatVal = await getVatAmount(page, logger);
      }
      
      if (vatVal <= 0) {
        logger.error('Failed to apply 13% VAT. Vat Amount is still 0 in the summary.');
        throw new Error('VAT calculation verification failed: Vat Amount in summary is 0 for taxable entry.');
      } else {
        logger.info(`VAT verification passed: Vat Amount is Rs. ${vatVal}`);
      }
    }
  }

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

async function getVatAmount(page: Page, logger: AutomationLogger): Promise<number> {
  const rowLocators = [
    page.locator('tr:has-text("Vat Amount:")'),
    page.locator('div:has-text("Vat Amount:")'),
    page.locator('td:has-text("Vat Amount:")')
  ];

  for (const locator of rowLocators) {
    if (await locator.count() > 0) {
      const activeLoc = locator.last();
      // Check if there is an input field inside this row
      const inputLocator = activeLoc.locator('input');
      if (await inputLocator.count() > 0) {
        const valStr = await inputLocator.first().inputValue();
        logger.info(`Found VAT Amount in input field inside summary row: ${valStr}`);
        const parsed = parseFloat(valStr || '0');
        if (!isNaN(parsed)) return parsed;
      }
      // Check text content of the row
      const textContent = await activeLoc.textContent();
      if (textContent) {
        logger.info(`Found VAT Amount row text content: ${textContent}`);
        // Remove label and extract number
        const cleanText = textContent.replace(/Vat\s*Amount:/i, '').replace(/,/g, '').trim();
        const val = parseFloat(cleanText);
        if (!isNaN(val)) {
          return val;
        }
      }
    }
  }

  // Fallback: search for input fields with id/name/class containing vat or similar
  const fallbackInputs = page.locator('input[id*="vat" i], input[name*="vat" i], input[class*="vat" i]');
  const count = await fallbackInputs.count();
  for (let i = 0; i < count; i++) {
    const valStr = await fallbackInputs.nth(i).inputValue();
    const val = parseFloat(valStr || '0');
    if (!isNaN(val) && val > 0) {
      logger.info(`Found VAT Amount in fallback input ${i}: ${val}`);
      return val;
    }
  }

  return 0;
}
