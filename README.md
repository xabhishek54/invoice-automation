# AI Invoice Automation App

A self-hosted AI-powered invoice processing platform for extracting, verifying, and automating invoice entry into ERP systems.

> ⚠️ Built primarily by vibe coding(AI Assisted). The focus of this project is rapid prototyping, workflow automation, and practical functionality.

## ✨ Features
- 📤 **Batch invoice upload** with drag & drop support
- 🤖 **AI-powered invoice data extraction** using Google Gemini Vision
- 👨‍💼 **Human verification and editing** before automation
- 🔍 **Optional IRD PAN verification** (real-time checks against official Nepalese taxpayer registry in ~1.5s)
- 📊 **Real-time processing dashboard** with status tracking
- ⚡ **Background processing** for large invoice batches
- 🤖 **Automated ERP data entry** using Playwright
- 💾 **SQLite database** with Prisma ORM
- 🔄 **n8n workflow automation** for extraction and browser automation
- 🌐 **Fully self-hosted** with optional Cloudflare Tunnel support

---

## Technical Stack
- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **Backend**: Express + TypeScript + Playwright
- **Database**: SQLite + Prisma ORM

---

## Setup

### Prerequisites
- Node.js (v18+)
- npm
- Docker (for n8n)

### Installation
1. Clone the repo:
   ```bash
   git clone https://github.com/xabhishek54/invoice-automation
   cd "Invoice Automation"
   ```
2. Install dependencies:
   ```bash
   npm run install-all
   ```
3. Install Playwright browser engines:
   ```bash
   npx playwright install chromium
   ```
4. Setup SQLite database:
   ```bash
   cd backend
   npx prisma db push
   npx prisma generate
   cd ..
   ```
5. Configure environment:
   Create a `.env` in `backend/`:
   ```env
   PORT=5000
   DATABASE_URL="file:./dev.db"
   N8N_WEBHOOK_URL="http://localhost:5678/webhook/invoice-confirmed"
   ```

---

## Running the App

### Start App + n8n Docker Container
```bash
chmod +x start.sh
./start.sh
```

### Start App Only (React + Express)
```bash
npm run dev
```
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`

---

## n8n Integration

### 1. Push Extracted Data to App
Add an **HTTP Request** node in n8n to push JSON data to the dashboard:
- **Method**: `POST`
- **URL**: `http://localhost:5000/api/invoices`
- **Body**:
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

### 2. Webhook Callback on Confirmation
When an invoice is confirmed, the backend calls your `N8N_WEBHOOK_URL` with this payload:
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
Use this callback to trigger your target website entry nodes.
