# BOM Consumption Tracking - User Guide

## Overview

The BOM (Bill of Materials) Consumption Tracking feature allows plant floor operators to record material usage against active production orders using mobile devices. This system ensures accurate inventory tracking, lot traceability, and compliance with FIFO (First In, First Out) guidelines.

## Access

### Location
Navigate to: **Operations → BOM Consumption**

Or use the direct URL: `/operations/bom-consumption`

### Required Permissions
- **Production Operator** role or higher
- **Production Manager** role for editing historical records
- **Admin** role for full access

## Key Features

- ✅ Mobile-friendly interface optimized for smartphones and tablets
- ✅ QR code scanning for lot numbers and inventory IDs
- ✅ Real-time consumption tracking with progress indicators
- ✅ FIFO compliance warnings
- ✅ Complete consumption history with audit trails
- ✅ Edit capability for corrections
- ✅ Offline detection and warning

## Getting Started

### Step 1: Select a Schedule Order

1. Open the BOM Consumption page
2. Click the **Select Schedule Order** dropdown
3. Choose an active schedule order from the list
   - Format: `SO-####-### - Recipe Name`
4. The recipe details and BOM items will appear

### Step 2: View BOM Items

Once a schedule order is selected, you'll see:
- **Recipe Info Card**: Recipe name, revision, and status
- **BOM Items List**: All materials required for this order
- **Progress Indicators**: Visual bars showing consumption status

Each BOM item card displays:
- **Item Name & Number**: Material identification
- **Planned Quantity**: Total amount required
- **Consumed**: Amount already used
- **Remaining**: Amount still needed
- **Progress Bar**: Visual completion indicator

### Step 3: Record Consumption

To record material usage:

1. Locate the BOM item you're consuming
2. Click the **Scan & Record** button
3. The consumption recording sheet opens with a 3-step flow

#### Step 1: Scan Lot Code

**Using QR Scanner:**
1. Click **Open Scanner**
2. Allow camera access if prompted
3. Point camera at QR code
4. Hold steady until scan completes

**Manual Entry (Fallback):**
1. Click **Manual Entry** tab
2. Type or paste the lot number or inventory ID
3. Click **Submit Code**

**What Happens Next:**
- System validates the lot exists and matches the item
- Displays lot details:
  - Lot number or inventory ID
  - Storage location
  - Available quantity
  - FIFO recommendation status

⚠️ **FIFO Warning:** If the scanned lot is not the oldest available, you'll see a warning. It's recommended to use FIFO-first inventory when possible.

#### Step 2: Enter Quantity

1. Enter the amount consumed in the **Quantity Consumed** field
2. **Quick Actions** (optional):
   - Click **25%**, **50%**, or **75%** for quick fill
   - Click **Use Remaining** to fill exact remaining amount
3. Add optional notes (e.g., "Partial bag", "Adjusted for spillage")

**Validation:**
- ✅ **Green**: Quantity is valid
- 🔴 **Red (Blocking)**: Exceeds available inventory
- 🟡 **Yellow (Warning)**: Over-consumption vs. planned amount
- 🔵 **Blue (Info)**: Less than remaining planned amount

4. Click **Continue to Review**

#### Step 3: Confirm & Submit

Review the summary:
- **BOM Item**: Material name and number
- **Lot Information**: Source lot and location
- **Consumption Details**: Quantity and timestamp
- **Summary Stats**: After-recording totals

1. Verify all information is correct
2. Click **Confirm** to record consumption
3. Success message appears
4. Sheet closes automatically after 2 seconds

**Result:**
- Consumption record is saved
- BOM item progress bar updates
- Available inventory decreases
- Audit trail is created

## Viewing Consumption History

To view all consumption records for a BOM item:

1. Locate the BOM item on the main page
2. Click the **History** button
   - Button shows record count: `History (3)`
   - Disabled if no records exist
3. History sheet opens

### History Sheet Features

**Summary Section:**
- Planned quantity
- Total consumed
- Remaining amount

**Consumption Records:**
- Grouped by lot number
- Sorted newest to oldest
- Each record shows:
  - Quantity consumed
  - Consumption date and time
  - Lot number or inventory ID
  - Optional notes
  - Created by (user)
  - Edit status ("Edited" badge if modified)

## Editing Consumption Records

To correct an existing record:

1. Open the consumption history
2. Find the record to edit
3. Click the **Edit** icon (pencil)
4. Edit dialog opens

**Editable Fields:**
- Quantity consumed
- Consumed at (date/time)
- Notes

**Original Record Info:**
- Displays original values for reference
- Shows who created the record

5. Make changes
6. Click **Save Changes**

**Important:**
- All edits are tracked in the audit trail
- "Last edited by" information is recorded
- "Edited" badge appears on the record card

## Understanding Warnings and Errors

### FIFO Warnings (Yellow)
**Message:** "This is not the oldest lot. Consider using FIFO inventory first."

**Meaning:** There's older inventory available for this item.

**Action:**
- Use the recommended lot if possible
- If you must use this lot, document the reason in notes
- System allows you to proceed

### Insufficient Inventory (Red)
**Message:** "Insufficient Inventory: The quantity entered exceeds available quantity in this lot."

**Meaning:** Not enough material in the scanned lot.

**Action:**
- Reduce quantity to available amount
- Or scan a different lot
- Cannot proceed until resolved

### Over Consumption (Yellow)
**Message:** "Over Consumption: Total consumption will exceed planned quantity."

**Meaning:** You're using more than originally planned.

**Action:**
- Verify quantity is correct
- Add note explaining why (e.g., "Recipe adjustment", "Waste")
- System allows you to proceed

### Lot Not Found (Red)
**Message:** "Lot Not Found: The scanned code does not match any lot or inventory record."

**Meaning:** Invalid or non-existent lot code.

**Action:**
- Verify the code is correct
- Try scanning again
- Use manual entry to type carefully
- Contact supervisor if lot should exist

## Offline Mode

If you lose internet connection:

**What Happens:**
- Red banner appears at top: "No Internet Connection"
- Existing data remains visible
- New scans and recordings will fail

**What to Do:**
- Wait for connection to restore
- Or move to area with better signal
- When back online, green banner confirms: "Back Online"

**Future Enhancement:** Offline mode with queue-and-sync capability is planned.

## Best Practices

### For Accurate Tracking

1. **Scan immediately** when consuming material
   - Don't wait until end of shift
   - Real-time data is more accurate

2. **Use FIFO** whenever possible
   - Follow system recommendations
   - Helps with inventory rotation

3. **Add notes** for unusual situations
   - Over/under consumption
   - Quality issues
   - Equipment problems

4. **Verify quantities** before confirming
   - Double-check the amount
   - Use scale when available

### For Efficiency

1. **Use quick actions**
   - 25%, 50%, 75% buttons for common amounts
   - "Use Remaining" for final consumption

2. **Manual entry** as backup
   - If QR code is damaged
   - If camera isn't working
   - Type lot number carefully

3. **Expand cards** to see recent history
   - Quick reference without opening full history
   - Shows last 3 consumption records

## Troubleshooting

### Camera Won't Open

**Problem:** "Camera permission denied" message

**Solutions:**
1. Check browser permissions:
   - iOS Safari: Settings → Safari → Camera
   - Android Chrome: Settings → Site Settings → Camera
2. Grant camera access to the website
3. Reload the page
4. Use manual entry as fallback

### Scan Not Working

**Problem:** QR code won't scan

**Solutions:**
1. Ensure adequate lighting
2. Hold camera 4-6 inches from code
3. Keep camera and code steady
4. Clean camera lens if dirty
5. Try manual entry of lot number

### Wrong Lot Scanned

**Problem:** Scanned wrong lot by mistake

**Solutions:**
1. Click **Back** button in the sheet
2. Returns to scan step
3. Scan correct lot
4. Or close sheet and start over

### Need to Edit Recent Record

**Problem:** Just recorded wrong quantity

**Solutions:**
1. Click **History** button immediately
2. Find the record (will be at top)
3. Click **Edit** icon
4. Correct the quantity
5. Add note explaining the change

### Page Won't Load

**Problem:** "Failed to load schedule orders" error

**Solutions:**
1. Check internet connection (look for offline banner)
2. Click refresh/reload in browser
3. Try logging out and back in
4. Contact IT if persists

## Mobile Tips

### For Phones

- **One-handed operation**: Most buttons are at bottom for easy thumb reach
- **Landscape mode**: Works but portrait is optimized
- **Notifications**: Keep browser open to avoid losing progress
- **Screen lock**: Adjust timeout to avoid interruptions

### For Tablets

- **Two-column layout**: Automatically activates on larger screens
- **Side sheets**: Replace bottom sheets for better use of space
- **Stylus support**: Works with Apple Pencil or similar
- **Split screen**: Can view reference documents alongside

## Keyboard Shortcuts

When using a keyboard (tablet or desktop):

- **Enter**: Submits forms (manual entry, quantity input)
- **Escape**: Closes dialogs and sheets
- **Tab**: Navigate between fields
- **Space**: Activates focused button

## Privacy & Audit Trail

### What's Recorded

Every consumption record includes:
- **User ID**: Who recorded the consumption
- **Timestamp**: When it was recorded
- **Consumed At**: When material was actually used
- **Lot/Inventory ID**: Source of material
- **Quantity**: Amount consumed
- **Notes**: Optional user comments

### Edit Tracking

When a record is edited:
- **Updated By**: Who made the edit
- **Updated At**: When the edit occurred
- **Original Values**: Preserved in database
- **Audit Log**: Complete history available to managers

### Data Security

- All data transmitted over HTTPS
- User authentication required
- Role-based access control
- Audit logs cannot be deleted

## Support

### Getting Help

**For operational questions:**
- Contact your production supervisor
- Reference this user guide
- Check the troubleshooting section

**For technical issues:**
- Report to IT support desk
- Include screenshots if possible
- Note any error messages

**For feature requests:**
- Submit through normal feedback channels
- Explain the use case
- Suggest improvement

### Training

New operators should:
1. Read this complete user guide
2. Practice with supervisor present
3. Record test consumption (non-production)
4. Ask questions before independent use

## Glossary

**BOM (Bill of Materials)**: List of all materials required for a recipe

**Schedule Order**: A production order scheduled for execution

**Recipe Instance**: Active copy of a master recipe for a specific production run

**Lot Number**: Supplier-provided identifier for a batch of material

**Inventory ID**: Internal system identifier for inventory record

**FIFO**: First In, First Out - inventory management method

**Consumption**: The act of using raw material in production

**Actual**: Recorded quantity used (vs. planned quantity)

**Audit Trail**: Complete history of who did what and when

## Related Features

### Next Steps After Consumption Tracking

Once material is consumed:
1. **Production Execution**: Complete process steps
2. **Yield Recording**: Record output quantities
3. **Quality Checks**: Document quality metrics
4. **Order Completion**: Finalize the production order

### Integration Points

- **NetSuite ERP**: Consumption syncs to financial system
- **Inventory Management**: Available quantities update
- **Lot Traceability**: Complete chain of custody
- **Production Reporting**: Consumption appears in reports

## Updates and Releases

### Current Version: 1.0.0 (January 2025)

**Features:**
- Mobile BOM consumption tracking
- QR code scanning
- Lot lookup and validation
- FIFO compliance checking
- Consumption history and editing
- Offline detection

### Planned Enhancements

**Version 1.1 (Q1 2025):**
- Offline mode with sync
- Barcode scanning (1D barcodes)
- Voice input for quantities
- Photo attachments

**Version 1.2 (Q2 2025):**
- Batch consumption recording
- Scale integration
- Analytics dashboard
- Mobile app (native iOS/Android)

### Changelog

**1.0.0 - January 15, 2025**
- Initial release
- Core consumption tracking workflow
- Mobile-optimized interface
- E2E testing complete

---

## Quick Reference Card

### Recording Consumption (Quick Steps)

1. ⚙️ Select schedule order
2. 📱 Click "Scan & Record" on item
3. 📷 Scan QR code (or enter manually)
4. 🔢 Enter quantity consumed
5. ✅ Review and confirm

### Common Actions

| Action | Steps |
|--------|-------|
| **Record consumption** | Select order → Click "Scan & Record" → Scan → Enter quantity → Confirm |
| **View history** | Find item → Click "History" button |
| **Edit record** | Open history → Find record → Click edit icon → Make changes → Save |
| **Check FIFO** | Look for yellow "FIFO Warning" banner after scan |
| **Use remaining** | In quantity step → Click "Use Remaining" button |

### Important Numbers

- **Minimum quantity**: 0.01
- **Camera distance**: 4-6 inches from QR code
- **Auto-refresh interval**: 30 seconds
- **Edit timeout**: Unlimited (records can always be edited)

---

*For more information, contact the MES Support Team or your production supervisor.*
