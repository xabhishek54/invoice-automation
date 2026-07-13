# Nepali VAT Invoice Verification Web Application

This web application serves as a verification dashboard allowing human operators to inspect, edit, and verify invoice data extracted by AI (via Gemini inside n8n) before it is entered into target ERP platforms.

---

## Architecture Overview

- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **Backend**: Express + TypeScript + Playwright (for live tax searches)
- **Database**: SQLite with Prisma ORM
- **OCR/AI Queue**: n8n workflow with Gemini integration
- **Verification Engine**: Real-time Playwright-based background verification against the official Inland Revenue Department (IRD) registry.

---

## Features

- **Verify with IRD (Nepal Taxpayer Registry)**: On-demand verification of Supplier PANs directly against the official government database.
  - Reuses a background Playwright Chromium instance with resource blocking (aborts CSS, images, and fonts) to perform queries in **~1.2 seconds**.
  - Resolves invisible reCAPTCHA checks natively.
  - Automatically compares the IRD registered name against the invoice supplier name.
- **Continuous Flow (Sequential Navigation)**: Stepping through invoices sequentially. Saving or confirming an invoice automatically advances to the next pending item, returning you to the dashboard when complete.
- **Auto-Reset Stale Validations**: Editing the Supplier Name or PAN resets the verification status to ensure no stale checks are saved.
- **Theme Support**: Dark/Light mode toggle.
- **Clean centered full-width dashboard** optimized for rapid verification.

---

## 🛠️ Installation & Setup Guide

Follow these steps to set up the project locally.

### Prerequisites
- **Node.js** (v18 or higher)
- **npm** (v9 or higher)
- **Docker** (for running local n8n containers)
- **Git** (for cloning)

---

### Step 1: Clone the Repository
Clone the codebase to your local machine and navigate into the project directory:
```bash
git clone <your-repository-url>
cd "Invoice Automation"
```

---

### Step 2: Install Dependencies
Run the install command at the root directory to install packages for the root project, backend, and frontend concurrently:
```bash
npm run install-all
```

---

### Step 3: Install Playwright Browser Binaries
Since the backend uses Playwright to perform headless verification queries, install the required Chromium binaries:
```bash
npx playwright install chromium
```

---

### Step 4: Database Synchronization (Prisma)
Initialize and sync your SQLite database with the Prisma schema. Navigate to the backend directory and run:
```bash
cd backend
npx prisma db push
npx prisma generate
cd ..
```
This generates the Prisma client and creates a `dev.db` SQLite database file inside `backend/prisma/`.

---

### Step 5: Configure Environment Variables
Create a `.env` file in the `backend/` folder to configure ports and webhook targets:
```bash
cp backend/.env.example backend/.env
```
Ensure your `backend/.env` contains:
```env
PORT=5000
DATABASE_URL="file:./dev.db"
N8N_WEBHOOK_URL="http://localhost:5678/webhook/invoice-confirmed"
```
*(Replace `localhost:5678` with your n8n server instance URL if it is running on a different port or server).*

---

## 🚀 How to Run the Application

You can start the complete application setup including n8n docker containers and server packages.

### Method A: Start Everything (n8n + App)
Use the startup script at the root directory to launch Docker, start the n8n container, and run development servers:
```bash
chmod +x start.sh
./start.sh
```

### Method B: Start Application Only
If you already have n8n running or want to run the React dashboard and Express API alone, run at the root directory:
```bash
npm run dev
```
- **Frontend Dashboard**: Runs on `http://localhost:5173` (or `http://localhost:5174` if port is in use).
- **Backend API**: Runs on `http://localhost:5000`.

---

## 🧪 Testing the IRD Verification

To test the different verification states on the **Verification Page** without making slow requests or triggering CAPTCHA blocks, you can enter the following values in the **Supplier PAN** field:

### 1. Pre-configured Mock Database Records (Instant)
- **`603633087`**: Returns `Ratna Kirana Pasal` (Status: `Active`). If the Supplier Name is also `Ratna Kirana Pasal`, it reports a successful match. Any other name triggers a mismatch warning.
- **`300146510`**: Returns `ABHISHEK SUPPLIERS TRADERS` (Status: `Active`).
- **`606129279`**: Returns `ADITYA ENTERPRISES` (Status: `Active`).

### 2. Dummy Testing Simulated Records (Instant)
- **`999999999`**: Simulates a **"PAN not found"** state (database registers `verified: false`).
- **`888888888`**: Simulates a **"Name does not match"** state (returns `Simulated Mismatched Company Ltd`).

### 3. Live IRD Search
- Enter any other valid **9-digit PAN** (e.g. `610121180` or `302926077`). Clicking `Verify with IRD` will launch the background Playwright browser, query the live Inland Revenue portal, and return actual taxpayer registry data!
- If the live government portal is down or blocks the request, it will gracefully update the UI with a `"Verification failed: IRD website timed out or blocked by CAPTCHA"` message instead of returning a false match.

---

## 🔄 n8n Webhook Configuration

### Step 1: Pushing Extracted Data from n8n to App
At the end of your AI extraction workflow, add an **HTTP Request** node to push the extracted data to `/api/invoices`:
- **Method**: `POST`
- **URL**: `http://localhost:5000/api/invoices` *(or docker bridge host `http://172.17.0.1:5000/api/invoices`)*
- **Body Content Type**: `JSON`
- **Payload**:
  ```json
  {
    "supplier_name": "Supplier Name",
    "supplier_pan": "123456789",
    "bill_number": "1234",
    "miti_bs": "2080-01-01",
    "taxable_amount": "1000",
    "non_taxable_amount": "0"
  }
  ```

### Step 2: Resuming Workflows on Confirmation
When an operator clicks **Confirm & Verify Invoice**, the backend sends a payload back to n8n at `N8N_WEBHOOK_URL` containing the verified fields:
```json
{
  "id": "invoice-uuid",
  "supplier_name": "Supplier Name",
  "supplier_pan": "123456789",
  "bill_number": 1234,
  "miti_bs": "2080-01-01",
  "taxable_amount": 1000,
  "non_taxable_amount": 0,
  "status": "Verified",
  "ird_verified": true,
  "ird_name": "Registered Name",
  "ird_status": "Active",
  "ird_name_match": true,
  "ird_verified_at": "timestamp"
}
```
Use this payload in subsequent n8n nodes (e.g., browser automation) to automate entry into target ERP solutions.
