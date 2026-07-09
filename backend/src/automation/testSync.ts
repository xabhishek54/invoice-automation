import { PrismaClient } from '@prisma/client';
import { runAutomationBatch } from './queue';

const prisma = new PrismaClient();

async function runTest() {
  console.log('--- STARTING AUTOMATION INTEGRATION TEST ---');
  
  // 1. Create a mock verified invoice
  const testInvoice = await prisma.invoice.create({
    data: {
      supplier_name: 'ABHISHEK SUPPLIERS TRADERS',
      supplier_pan: '300146510',
      bill_number: Math.floor(Math.random() * 9000) + 1000,
      miti_bs: '2082-10-25',
      taxable_amount: 50496.2,
      non_taxable_amount: 1530.0,
      status: 'Verified'
    }
  });

  console.log(`Created test verified invoice: ID=${testInvoice.id}, Bill=${testInvoice.bill_number}`);

  // 2. Trigger automation
  console.log('Triggering automation batch run...');
  // Since runAutomationBatch is async and closes browser, we await it here to see output
  await runAutomationBatch([testInvoice.id]);

  // 3. Fetch final invoice state
  const updatedInvoice = await prisma.invoice.findUnique({
    where: { id: testInvoice.id }
  });

  if (!updatedInvoice) {
    throw new Error('Test invoice was deleted during run?');
  }

  console.log('\n--- TEST RESULT ---');
  console.log(`Final Status: ${updatedInvoice.status}`);
  console.log(`Automation Error: ${updatedInvoice.automation_error}`);
  console.log(`Started At: ${updatedInvoice.automation_started_at}`);
  console.log(`Finished At: ${updatedInvoice.automation_finished_at}`);
  console.log('--- EXECUTION LOGS ---');
  console.log(updatedInvoice.automation_log || '(no logs)');
  console.log('----------------------');

  // Clean up test invoice
  await prisma.invoice.delete({ where: { id: testInvoice.id } });
  console.log('Cleaned up test invoice from database.');
  
  process.exit(0);
}

runTest().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
