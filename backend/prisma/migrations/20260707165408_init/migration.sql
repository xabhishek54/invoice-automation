-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplier_name" TEXT NOT NULL,
    "supplier_pan" TEXT NOT NULL,
    "bill_number" INTEGER NOT NULL,
    "miti_bs" TEXT NOT NULL,
    "taxable_amount" REAL NOT NULL,
    "image_path" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
