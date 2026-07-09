-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplier_name" TEXT NOT NULL,
    "supplier_pan" TEXT NOT NULL,
    "bill_number" INTEGER NOT NULL,
    "miti_bs" TEXT NOT NULL,
    "taxable_amount" REAL NOT NULL,
    "non_taxable_amount" REAL NOT NULL DEFAULT 0.0,
    "image_path" TEXT,
    "status" TEXT NOT NULL,
    "automation_error" TEXT,
    "automation_log" TEXT,
    "automation_started_at" DATETIME,
    "automation_finished_at" DATETIME,
    "captured_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_Invoice" ("automation_error", "automation_finished_at", "automation_log", "automation_started_at", "bill_number", "captured_at", "created_at", "id", "image_path", "miti_bs", "status", "supplier_name", "supplier_pan", "taxable_amount", "updated_at") SELECT "automation_error", "automation_finished_at", "automation_log", "automation_started_at", "bill_number", "captured_at", "created_at", "id", "image_path", "miti_bs", "status", "supplier_name", "supplier_pan", "taxable_amount", "updated_at" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
