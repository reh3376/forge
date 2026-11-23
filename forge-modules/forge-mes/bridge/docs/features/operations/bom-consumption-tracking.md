# BOM Consumption Tracking - User Guide

## Overview

The BOM (Bill of Materials) Consumption Tracking feature allows plant floor operators to record material usage against active production orders. Operators scan or enter lot numbers, and the system validates inventory, checks FIFO compliance, and records the consumption with a full audit trail.

## Access

### Location

Navigate to: **Operations → BOM Consumption**

Direct URL: `/operations/bom-consumption`

### Required Permissions

| Role | Record Consumption | Edit Records |
|------|:-:|:-:|
| Production Operator | ✅ | ❌ |
| Production Manager | ✅ | ✅ |
| Admin | ✅ | ✅ |

## Workflow Overview

```
Select Schedule Order
        ↓
  View BOM Items
        ↓
  Click "Record" on a BOM item
        ↓
  Record Consumption Sheet opens
        ↓
  Enter / Scan Lot Number → Lookup validates inventory
        ↓
  Enter Quantity Consumed
        ↓
  Click "Record Consumption"
        ↓
  Inventory updated + Audit trail created
```

## Step-by-Step Instructions

### Step 1: Select a Schedule Order

1. Open the BOM Consumption page
2. Select an active schedule order from the dropdown
   - Format: `SO-####-### - Recipe Name`
3. The BOM items list loads below

### Step 2: View BOM Items

Each BOM item card shows:
- **Item Name & Number**: Material identification
- **Planned Quantity**: Total required (e.g., `500.00 lbs`)
- **Progress**: How much has been consumed vs. planned

### Step 3: Open the Consumption Sheet

Click the **Record** button on the BOM item you are consuming.

A side sheet opens on the right with the following sections:

#### Material Info

Displays the item's required quantity and item number for reference.

#### Lot Number

Enter or scan the lot number using one of three methods:

| Method | How to Use |
|--------|-----------|
| **Type manually** | Click the text field and type the lot number or inventory ID, then press **Enter** or click outside the field |
| **Search button** | Type a value and click the magnifying glass icon to trigger lookup |
| **QR / Barcode scanner** | Click the QR code icon to open the scanner modal |

After entering a lot number, the system automatically looks up the inventory record and displays:
- Lot number
- Storage location (silo or bin)
- Available quantity
- FIFO recommendation status

> ⚠️ **FIFO Warning**: If the scanned lot is not the oldest available for this item, a yellow alert appears. You can still proceed, but consider using the FIFO-recommended lot and documenting the reason in Notes.

> 🔴 **Lot Not Found**: If the code does not match any inventory record for this item, a red alert appears. Verify the code and try again.

#### Quantity Consumed

Enter the amount consumed. The unit abbreviation (e.g., `lbs`, `bu`) is shown to the right. The planned quantity is shown below the field for reference.

#### Notes (Optional)

Add any relevant context — for example: `Partial bag`, `Quality hold`, `Adjusted for spillage`.

#### Submit

- **Cancel**: Closes the sheet without saving
- **Record Consumption**: Saves the record, deducts inventory, and creates an audit entry

The **Record Consumption** button is disabled until both a lot number and a quantity are provided.

---

## Using the QR / Barcode Scanner

Clicking the QR code icon opens a scanner modal with two modes:

### Camera Mode

- Uses the device's rear-facing camera
- Hold the QR code or barcode 4–6 inches from the lens
- A finder overlay shows the scan area
- Flashlight (torch) button is available for low-light environments
- **Requires HTTPS** — on a plain HTTP connection (e.g., `http://10.0.22.10`), camera mode is automatically disabled and the modal switches to Manual Entry

### Manual Entry Mode (Keyboard-Wedge)

- A text field is automatically focused when this mode is active
- Compatible with **Keyence** and other USB/Bluetooth handheld barcode scanners that act as keyboard-wedge devices — just scan and the scanner types the code and presses Enter automatically
- Can also be used to type a code by hand
- Click **Submit** or press **Enter** to confirm

> **Note:** When you click the QR icon from the Consumption Sheet, the scanner opens in **Manual Entry** mode by default so that handheld scanners work immediately without any extra steps.

---

## Viewing Consumption History

To see all consumption records for a BOM item:

1. Locate the BOM item card
2. Click the **History** button (shows record count when records exist)
3. A history sheet opens showing all records sorted newest to oldest

Each record shows:
- Quantity consumed
- Lot number or inventory ID
- Date and time consumed
- Created by
- Notes (if any)
- **Edited** badge if the record has been modified

---

## Editing Consumption Records

> Requires **Production Manager** or **Admin** role.

1. Open the history sheet for the BOM item
2. Find the record to edit and click the pencil (edit) icon
3. Modify the editable fields:
   - Quantity consumed
   - Consumed at (date/time)
   - Notes
4. Click **Save Changes**

All edits are tracked — the record shows who last edited it and when. Inventory quantities are adjusted automatically based on the quantity delta.

---

## Warnings and Errors Reference

| Message | Meaning | Action |
|---------|---------|--------|
| **FIFO Warning** (yellow) | A different lot has an older FIFO index | Use the recommended lot if possible; document reason in Notes if not |
| **Lot Not Found** (red) | No inventory found matching this code + item | Verify the code; try manual entry; contact supervisor |
| **Failed to Record** (red toast) | Server-side error saving the record | Check network connection; retry; contact IT if persists |

---

## Troubleshooting

### Camera won't open / "Camera requires HTTPS"

**Cause**: The browser blocks camera access on non-HTTPS connections (e.g., `http://10.0.22.10`).

**Solution**: Use **Manual Entry** mode instead. Handheld scanners (Keyence, etc.) work perfectly in manual mode — the scanner types the barcode into the field and presses Enter automatically.

### Camera permission denied

**Cause**: The browser does not have permission to access the camera.

**Solutions**:
1. iOS Safari: **Settings → Safari → Camera** → Allow
2. Android Chrome: tap the lock icon in the address bar → **Permissions → Camera** → Allow
3. After granting permission, reload the page
4. Or use Manual Entry mode as a fallback

### QR code won't scan

1. Ensure adequate lighting (use the torch button)
2. Hold camera 4–6 inches from the code
3. Keep the device and label steady
4. Clean the camera lens if smudged
5. Switch to **Manual Entry** and type the lot number

### Lot lookup returns "Not Found" but lot should exist

1. Confirm the item being consumed is the correct item for this lot
2. Check whether the lot has zero remaining quantity (it will not appear in lookup results)
3. Try the internal inventory UUID if you have it (instead of the lot number)
4. Contact your supervisor to verify the lot exists in the system

### "Record Consumption" button stays disabled

The button requires both fields:
- A non-empty lot number (it does not need to be validated, but must be entered)
- A non-empty quantity value

Check that both fields have values.

### Record saved with wrong quantity

1. Click **History** on the BOM item immediately
2. Find the record at the top (most recent)
3. Click the edit icon (requires Production Manager role or higher)
4. Correct the quantity and add a note explaining the change
5. Click **Save Changes**

---

## Best Practices

1. **Scan at the time of consumption** — real-time data is more accurate than end-of-shift entry
2. **Follow FIFO recommendations** — use the system's suggested lot when possible
3. **Add notes for unusual situations** — over/under consumption, quality issues, substitutions
4. **Verify quantity before submitting** — double-check against your scale or measurement

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Enter** (in lot number field) | Trigger lot lookup |
| **Enter** (in scanner modal) | Submit manual code |
| **Escape** | Close scanner modal or sheet |
| **Tab** | Move between form fields |

---

## Glossary

| Term | Definition |
|------|-----------|
| **BOM** | Bill of Materials — the list of all raw materials required for a recipe |
| **Schedule Order** | A production order that has been placed in the execution queue |
| **Lot Number** | Supplier-assigned identifier for a batch of material |
| **Inventory ID** | Internal UUID for a specific inventory record (can be encoded in a QR code) |
| **FIFO** | First In, First Out — using oldest inventory first to prevent spoilage and maintain traceability |
| **Consumption** | Recording that a quantity of raw material was used in production |
| **Audit Trail** | Immutable log of who recorded or edited each consumption entry and when |

---

## Technical Notes

### Lot Lookup Logic

When a code is entered, the backend applies a two-step lookup:

1. **UUID check** — if the code matches a CUID or UUID v4 pattern, it looks up the inventory record directly by ID and verifies the item matches
2. **Lot number search** — otherwise, searches for inventory records with `lotNumber = code AND itemId = <item> AND currentQuantity > 0`, ordered by `fifoIndex ASC` (oldest first)

The `isRecommended` flag is `true` only when the returned inventory record has the lowest `fifoIndex` among all non-zero-quantity records for the same item and storage asset.

### Inventory Deduction

When a consumption is recorded against an inventory ID, `Inventory.currentQuantity` is decremented immediately. If the inventory update fails (e.g., a transient DB error), the consumption record is still saved — inventory can be reconciled separately.

For **edits**, the system calculates the delta (`new quantity - old quantity`) and adjusts inventory accordingly:
- Positive delta → additional deduction
- Negative delta → inventory restored

### Audit Trail

Every consumption record is created with `createdBy` (the logged-in user's email). Edits update `updatedBy` and `updatedAt`, and the change is also written to the central audit log via `AuditService.logChange()` with old and new field values.

---

## Related Features

- **Silo Inventory**: Source inventory for grain receipts and their FIFO indexes
- **Schedule Order Queue**: Determines which orders appear in the active order list
- **Production Reporting**: Consumption actuals feed into production yield reports
- **NetSuite ERP Sync**: Consumption data flows to financial system for cost accounting

---

*For technical issues, contact IT support. For operational questions, contact your production supervisor.*
