# Standard Operating Procedures — Order Management

## SOP-001: Production Order Creation

### Purpose
Define the standard process for creating new Production Orders in the MES system.

### Procedure

1. **Verify prerequisites**
   - Customer exists in the system with a valid customer code
   - Master recipe exists for the desired mash bill
   - Required units of measure are configured
   - BOM items (ingredients) are available in the item catalog

2. **Open the Production Order Wizard**
   - Navigate to the order management interface
   - Select "Create Production Order"

3. **Enter order details**
   - Order name (unique, descriptive)
   - Customer code
   - Quantity (number of barrels/containers)
   - Start and end dates for production window
   - Priority level

4. **Select recipe and specifications**
   - Choose the master recipe
   - Verify whiskey type matches the recipe
   - Enter final proof target
   - Select container type
   - Set upper and lower control limits

5. **Review production planning**
   - Verify fermenter and cook estimates
   - Confirm grain load calculations
   - Review yield estimates (PG/BBL, PG/bushel)
   - Adjust if using manual planning mode

6. **Confirm BOM items**
   - Review all Bill of Materials items
   - Verify quantities, units, and categories
   - Add any missing items

7. **Configure bin assignments**
   - Select milling bin configurations (SIL110, SIL115, SIL120)
   - Verify cooks per fermenter and entry proof

8. **Schedule (optional)**
   - If auto-scheduling: confirm scheduling window and targets
   - If manual scheduling: note that the PrO will need to be added to a SchO later

9. **Submit and verify**
   - Review the generated item number
   - Confirm the PrO was created with status "Initiated"
   - If auto-scheduled, confirm SchO and queue entry were created

### Approval
Production Orders require review by the production scheduler before being committed to the schedule.

---

## SOP-002: Schedule Order Creation and PrO Grouping

### Purpose
Define the standard process for creating Schedule Orders by grouping compatible Production Orders.

### Procedure

1. **Identify compatible Production Orders**
   - Query for unscheduled PrOs (status: Initiated, scheduled: false)
   - Filter by recipe group (mash bill) — all PrOs must share the same mash bill
   - Use `findCompatibleProductionOrders()` to discover matches

2. **Validate grouping**
   - Confirm all PrOs have the same recipe group
   - Review warnings for different container types, proofs, or customers
   - Verify no PrOs are already scheduled

3. **Create the Schedule Order**
   - Select the PrOs to group
   - Submit to `createScheduleOrderFromProductionOrders()`
   - System auto-generates: SchO name, customer list, production allocation, SORI

4. **Review the created Schedule Order**
   - Verify all PrOs are linked (check `scheduleOrderId` on each PrO)
   - Confirm PrO statuses changed to "Committed"
   - Review timeline estimates
   - Verify customer allocation

5. **Set production loads**
   - Enter total grain weight (lbs)
   - Enter total water volume (gallons)
   - BOM quantities will auto-calculate

6. **Add to production queue**
   - If not auto-queued, create a queue entry
   - Set the appropriate queue position
   - Verify area assignments (e.g., Granary)

### Notes
- The SchO name follows the format: `SchO-{recipeName}-{date}-{randomHex}`
- The SORI is created when the SchO becomes active (position 0), not at creation time
- Grain weight must be set before the SchO can be activated

---

## SOP-003: Production Planning Review

### Purpose
Ensure production plans are accurate and resources are properly allocated before starting production.

### Procedure

1. **Review yield estimates**
   - Check the yield estimation results for the SchO
   - Verify: total barrels, proof gallons, fermenters needed, cooks needed, grain required
   - Compare auto-calculated values with manual estimates

2. **Verify recipe configuration**
   - Confirm the correct master recipe is linked
   - Review BOM items and calculation modes
   - Verify mashing protocol steps and temperatures

3. **Check production resources**
   - Confirm fermenter availability for the planned count
   - Verify grain inventory for the required grain load
   - Check water supply for the estimated water volume

4. **Validate timeline**
   - Review estimated start and end times
   - Confirm mashing duration (totalCooks x 2 hours)
   - Confirm fermentation duration (72 hours + mashing)
   - Check for scheduling conflicts with other orders in the queue

5. **Approve or adjust**
   - If auto mode: accept system calculations or switch to manual
   - If manual mode: enter verified values for cooks, fermenters, grain
   - Document any overrides with notes

6. **Sign off**
   - Production supervisor reviews and approves the plan
   - Record approval in the order notes or audit log

---

## SOP-004: Queue Management

### Purpose
Define procedures for managing the production queue order.

### Procedure — Adding to Queue

1. Verify the SchO status is "Created" or "Scheduled"
2. Add to the queue via `addToPendingScheduleOrderQueue()`
3. New entry is placed at the end of the queue
4. Verify area assignment (Granary auto-assigned if available)

### Procedure — Reordering

1. Identify the order to move and its current position
2. Determine the target position (must be > 0 and <= maxIndex + 1)
3. Submit the reorder request
4. System handles index swapping with conflict retry
5. Verify the new position after the operation completes

### Procedure — Starting the Next Order

1. Confirm the current active order (position 0) is complete or ready to advance
2. Advance the queue: current order moves out, all indices decrement
3. New position-0 order becomes active
4. Recipe instance is created automatically for the new active order
5. Verify recipe instance exists and loads are set

### Procedure — Removing from Queue

1. Identify the order to remove (must be position 2+)
2. Submit descheduling request
3. System unlinks PrOs (reset to Initiated), deletes SORI, resequences queue
4. Verify affected PrOs are available for re-scheduling

---

## SOP-005: Inventory Allocation and BOM Consumption Tracking

### Purpose
Define procedures for tracking material consumption against the production BOM.

### Procedure

1. **Verify BOM setup**
   - Confirm the SORI has been created for the active SchO
   - Review calculated BOM quantities (quantityPlanned)
   - Verify lot traceability requirements for each item

2. **Record material consumption**
   - For each BOM item consumed during production:
     a. Scan or enter the lot number / inventory ID
     b. System validates the inventory record and checks FIFO compliance
     c. Enter the actual quantity consumed
     d. System creates a RecipeBomActual record

3. **FIFO compliance**
   - The system recommends FIFO-compliant inventory (lowest fifoIndex for item + asset)
   - Non-FIFO consumption is allowed but flagged
   - Track FIFO deviations for quality reporting

4. **Monitor consumption vs. planned**
   - Review `quantityPlanned` vs `quantityActual` for each BOM item
   - Flag significant deviations (> 10% over/under)
   - Update planned quantities if loads change

5. **Load updates**
   - When grain or water loads change, update via `updateLoads()`
   - System recalculates BOM quantities automatically
   - Items with existing consumption create revision records

---

## SOP-006: Cook Completion Recording

### Purpose
Define the process for recording completed cook cycles.

### Procedure

1. **Verify the cook is complete**
   - Confirm the cook cycle has finished on the equipment
   - Note the cooker number and any relevant details

2. **Record in MES**
   - Call `recordCookComplete()` with:
     - Schedule Order ID
     - Cook index (which cook number)
     - Cooker number (equipment identifier)
     - Completion timestamp
     - Notes (any observations or deviations)

3. **Verify status update**
   - Check `executedCooks` has incremented
   - If `executedCooks >= totalCooks`: confirm auto-transition to "ReadyForSeparation"

4. **Record to PLC** (if applicable)
   - After loading recipe to PLC, call `recordRecipeLoadedToPLC()`
   - System creates audit trail with recipe instance timestamp
   - Timestamp is captured for change detection (recipe modifications after PLC load)

---

## SOP-007: End-of-Day / End-of-Shift Status Review

### Purpose
Ensure all orders are properly tracked at shift handover.

### Checklist

- [ ] **Active order (position 0)**: Check execution status — cooks completed, fermenter status
- [ ] **Next order (position 1)**: Verify recipe instance pre-created, loads set
- [ ] **Queue review**: Confirm queue order matches production plan
- [ ] **BOM consumption**: Verify all materials consumed during shift are recorded
- [ ] **Deviations**: Log any deviations from planned quantities or timelines
- [ ] **Status updates**: Ensure all SchO and PrO statuses reflect current reality
- [ ] **Notes**: Document any issues or observations for the next shift

### Handover Communication

Record the following for the incoming shift:
1. Current active SchO and its production phase (mashing/fermentation/distillation)
2. Number of cooks completed vs. total
3. Any pending actions (loads to update, BOM to record, etc.)
4. Queue position of next orders
5. Any issues or escalations in progress

---

## SOP-008: Emergency Order Management

### Rush Orders

1. Create the PrO through the standard wizard process
2. Group into a new SchO or find compatible existing SchO
3. **Queue prioritization**: Reorder the queue to place the rush order at position 2 (next after current next-up)
4. Cannot jump to position 0 or 1 without completing/advancing current orders
5. Document the rush order justification in notes

### Order Cancellation

1. **Pre-production** (Initiated/Planned):
   - Cancel the PrO directly
   - If part of a SchO, deschedule first, then cancel

2. **In-production** (Committed/InProgress):
   - Cannot cancel directly
   - Remove from SchO via descheduling (only if queue position > 0)
   - Coordinate with production floor for in-progress adjustments
   - Escalate to production supervisor for active orders

3. **Post-production** (Complete):
   - Cannot cancel completed orders
   - Handle via inventory adjustment or customer communication

### Order Modification After Scheduling

1. **Before production starts**: Deschedule, modify the PrO, and reschedule
2. **During production**: Update SchO loads or recipe instance components (BOM, parameters, protocol)
3. **After separation**: Individual PO tracking — modifications are PO-level only

---

## SOP-009: Customer Communication Protocols

### Order Confirmation

When a PrO is created:
1. Verify item number generation is correct
2. Confirm customer, quantity, proof, container type
3. Record customer PO reference in order notes if provided
4. Production allocation is visible in the SchO's `productionOrderAllocation` JSON

### Status Updates

Provide customer updates at these milestones:
1. **Order Committed**: Production scheduled, estimated start/end dates available
2. **Production Started**: SchO moved to InProgress
3. **Ready for Separation**: All cooks complete, moving to individual order fulfillment
4. **Order Complete**: Product ready for shipment

### Multi-Customer Orders

When a SchO groups PrOs from multiple customers:
1. Each customer receives updates only for their specific PrOs
2. Production allocation tracking shows each customer's share
3. After separation, each customer's PrO is tracked independently

---

*See also: [Quick Reference](./quick-reference.md) | [Troubleshooting](./troubleshooting.md) | [User Guides](./user-guide-production-orders.md)*
