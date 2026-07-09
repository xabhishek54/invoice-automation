# Implementation Plan - Refactoring for Continuous Verification & n8n Integration

Based on your updated requirements, we will perform the following changes:
1. **Remove Image Preview**: The left-hand image preview panel will be removed. The verification page will feature a clean, centered layout.
2. **Larger Detail Text**: Increase font size, line spacing, and input size in the verification forms for better readability.
3. **Continuous Flow (Sequential Navigation)**: Implement "Next" and "Previous" navigation buttons on the verification screen, allowing you to walk through the filtered list of invoices sequentially. When you confirm or reject an invoice, it will automatically advance to the next pending item.
4. **Prisma Database Schema**: Update `image_path` in the SQLite database to be optional.
5. **n8n Integration Guide**: Document how to connect your n8n workflow (On form submission -> Gemini -> Convert to JSON) to this application.

---

## Proposed Changes

### 1. Database & Backend

#### schema.prisma
Change `image_path` to be optional:
```prisma
model Invoice {
  ...
  image_path     String?  // Made optional since images won't be provided
  ...
}
```

#### routes.ts
- Remove the strict check for `image` upload files in the `POST /api/invoices` endpoint.
- Make `image_path` optional and default to `null` or a blank string if not provided in JSON payloads.

---

### 2. Frontend Components

#### App.tsx
Update state management to support passing the active list of invoice IDs and the current selected index to the verification view.

#### Dashboard.tsx
Update click handlers to pass the list of filtered invoice IDs and the index of the clicked invoice.

#### VerificationPage.tsx
- Remove split-screen, center form layout.
- Apply larger typography for inputs and labels.
- Add "Previous" and "Next" buttons.
- Implement auto-advance on Confirm/Reject.

---

## n8n Integration Guide

1. **On form submission** (Trigger) -> **Basic LLM Chain** -> **Converting to JSON** -> **HTTP Request Node**
   - **Method**: `POST`
   - **URL**: `http://localhost:5000/api/invoices`
   - **Body Content Type**: `JSON`
   - **Fields**: Map `supplier_name`, `supplier_pan`, `bill_number`, `miti_bs`, `taxable_amount`.
2. **Webhook Trigger Node** (Starts the target automated entry workflow)
   - **Method**: `POST`
   - **Path**: `invoice-confirmed` (Webhook URL: `http://localhost:5678/webhook/invoice-confirmed`)
   - Set this URL as `N8N_WEBHOOK_URL` in `backend/.env`.
