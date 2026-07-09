import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing database of all invoice records...');
  const { count } = await prisma.invoice.deleteMany({});
  console.log(`Deleted ${count} records.`);

  // Ensure uploads directory exists
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // File paths for local WhatsApp sample images in the parent folder
  const sample1Source = path.join(__dirname, '../../../WhatsApp Image 2026-07-07 at 8.02.36 PM.jpeg');
  const sample2Source = path.join(__dirname, '../../../WhatsApp Image 2026-07-07 at 8.02.37 PM.jpeg');

  const sample1Dest = path.join(uploadsDir, 'invoice-sample-1.jpeg');
  const sample2Dest = path.join(uploadsDir, 'invoice-sample-2.jpeg');

  let image1Path: string | null = null;
  let image2Path: string | null = null;

  // Copy sample 1 if it exists
  if (fs.existsSync(sample1Source)) {
    console.log(`Found sample invoice image 1, copying to backend uploads...`);
    fs.copyFileSync(sample1Source, sample1Dest);
    image1Path = 'uploads/invoice-sample-1.jpeg';
  } else {
    console.log(`Warning: Sample image 1 not found at: ${sample1Source}`);
  }

  // Copy sample 2 if it exists
  if (fs.existsSync(sample2Source)) {
    console.log(`Found sample invoice image 2, copying to backend uploads...`);
    fs.copyFileSync(sample2Source, sample2Dest);
    image2Path = 'uploads/invoice-sample-2.jpeg';
  } else {
    console.log(`Warning: Sample image 2 not found at: ${sample2Source}`);
  }

  console.log('Seeding mock invoice data...');

  const invoice1 = await prisma.invoice.create({
    data: {
      supplier_name: 'ABHISHEK SUPPLIERS TRADERS',
      supplier_pan: '300146510',
      bill_number: 1572,
      miti_bs: '2082-10-25',
      taxable_amount: 157922.82,
      non_taxable_amount: 0.0,
      image_path: image1Path,
      status: 'Pending Verification'
    }
  });

  const invoice2 = await prisma.invoice.create({
    data: {
      supplier_name: 'ADITYA ENTERPRISES',
      supplier_pan: '606129279',
      bill_number: 4821,
      miti_bs: '2082-11-02',
      taxable_amount: 45200.00,
      non_taxable_amount: 12500.00,
      image_path: image2Path,
      status: 'Pending Verification'
    }
  });

  console.log(`Successfully seeded database:`);
  console.log(`- Invoice 1: ${invoice1.supplier_name} (ID: ${invoice1.id})`);
  console.log(`- Invoice 2: ${invoice2.supplier_name} (ID: ${invoice2.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

