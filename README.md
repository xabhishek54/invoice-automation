# Nepali VAT Invoice Verification Web Application

This web application serves as a verification dashboard allowing human users to inspect, edit, and verify invoice data extracted by AI (via Gemini inside n8n) before it is forwarded to other downstream websites or services.

## Features

- **No Image Preview Required**: A streamlined, centered, full-width admin dashboard.
- **Enhanced Typography**: Large, readable text inputs (`text-xl`) and clean labels.
- **Continuous Flow (Sequential Navigation)**: "Next" and "Previous" buttons let you step through invoices sequentially. Saving or confirming an invoice will automatically advance to the next pending item, returning you to the dashboard when complete.
- **Theme support**: Dark/Light mode toggle.
- **SQLite Database**: Dynamic storage with Prisma ORM.

---

## How to Run

1. **Install all packages** (run at the root folder):
   ```bash
   npm run install-all
   ```
2. **Launch the development servers** concurrently:
   ```bash
   npm run dev
   ```
   - **Frontend UI** runs on `http://localhost:5173`.
   - **Backend API** runs on `http://localhost:5000`.

---

## 🛠️ n8n Integration Guide

Here is the complete step-by-step setup to connect this application with your n8n workflow.

### Workflow Diagram
```text
[On form submission] ➔ [Basic LLM Chain] ➔ [Converting to JSON] ➔ [HTTP Request (POST /api/invoices)]
                                                                                │
                                                                       (Human Verification)
                                                                                ▼
[Automated target website entry] 🠜 [Webhook Trigger] 🠜 🠜 🠜 🠜 🠜 🠜 🠜 🠜 [Confirm Callback (POST)]
```

---

### Step 1: Push Extracted Data from n8n to App
At the end of your extraction workflow (immediately after your **Converting to JSON** node), add an **HTTP Request** node in n8n.

#### HTTP Request Node Configuration:
- **Method**: `POST`
- **URL**: `http://<TARGET_HOST>:5000/api/invoices`
  - *Note on Docker networking (Connection Refused):* If n8n runs in Docker on the same machine, `localhost` refers to the container itself. Use `http://172.17.0.1:5000/api/invoices` (Docker bridge IP) or `http://host.docker.internal:5000/api/invoices` instead.
- **Send Body**: Enabled
- **Body Content Type**: `JSON`
- **Specify Body**: `Using Fields Below`
- **Parameters** (Add the following name-value pairs):
  - `supplier_name`: `={{ $json.supplier_name }}`
  - `supplier_pan`: `={{ $json.supplier_pan }}`
  - `bill_number`: `={{ $json.bill_number }}`
  - `miti_bs`: `={{ $json.miti_bs }}`
  - `taxable_amount`: `={{ $json.taxable_amount }}`

When this runs, n8n pushes the JSON data to the SQLite database, showing up on your verification dashboard under status **"Pending Verification"**.

---

### Step 2: Listen for Confirmed Data in n8n (Detailed Guide)
When a human clicks **Confirm & Verify Invoice** on the dashboard, the application sends the validated details back to n8n so the workflow can resume.

#### 1. Add a Webhook Trigger Node in n8n
Create a brand new workflow in n8n (or a separate trigger branch) and add a **Webhook** node. This is the entry point for the confirmed data.

Configure the Webhook node:
- **Authentication**: `None`
- **HTTP Method**: `POST`
- **Path**: `invoice-confirmed`
- **Response Code**: `200`
- **Response Mode**: `Immediately`

#### 2. Get the Webhook URL
n8n will display two webhook URLs:
- **Test URL** (for development/testing): `http://<n8n-ip>:5678/webhook-test/invoice-confirmed`
- **Production URL** (for final deployment): `http://<n8n-ip>:5678/webhook/invoice-confirmed`

*Copy the appropriate URL.*

#### 3. Update the App Environment Configuration
Open your project's `backend/.env` file:
```env
PORT=5000
DATABASE_URL="file:./dev.db"
N8N_WEBHOOK_URL="http://<n8n-ip>:5678/webhook-test/invoice-confirmed"
```
*(Replace `<n8n-ip>` with the actual IP address or domain name where n8n is running. If n8n is running in Docker on your host machine, use the host IP, e.g., `http://172.17.0.1:5678/...`).*

#### 4. Add Automation Nodes after the Webhook Node
In n8n, drag a connector from this Webhook node to the next nodes (e.g. browser automation nodes or target database connectors). 
When this Webhook receives a payload, the JSON data will contain the corrected fields:
```json
{
  "id": "invoice-uuid-here",
  "supplier_name": "JASMINE HYGIENE PRODUCTS PVT. LTD",
  "supplier_pan": "610121130",
  "bill_number": 1572,
  "miti_bs": "2082-10-25",
  "taxable_amount": 157922.82,
  "status": "Verified",
  "verified_at": "timestamp"
}
```
You can map these fields directly to your target entry fields in the subsequent nodes.

---

## Troubleshooting "Connection Refused"
If n8n gives a `Connection Refused` error, check the following:
1. **Is the App Running?** Ensure you ran `npm run dev` in the terminal and it is running on port 5000.
2. **Are you using localhost inside Docker?** If n8n is in docker, `localhost` points inside the container. 
   - Run `ip a` in your terminal to find your docker bridge IP (usually `172.17.0.1`) or local LAN IP (e.g. `192.168.x.x`).
   - Replace `localhost` in the n8n request URL with this IP.
