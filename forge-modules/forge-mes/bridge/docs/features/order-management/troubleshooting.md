# Order Management Troubleshooting Guide

## Validation Errors

### Production Order Creation Failures

#### "Container type is required for MES Phase 1 compliance"
**Cause:** The wizard submission is missing the `containerType` field.
**Fix:** Select one of: LargeBarrel, SmallBarrel, BulkLoadout, PlasticDrum, IbcTote275, SsTote275.

#### "Final proof is required and must be greater than 0"
**Cause:** The `finalProof` field is missing or set to 0.
**Fix:** Enter a positive numeric value for the target proof.

#### "Customer is required for MES Phase 1 compliance"
**Cause:** No customer was selected or the `customerCode` doesn't match any customer.
**Fix:** Verify the customer exists in the system. Check the `customerCode` value matches the customer's code field.

#### "BOM is required for MES Phase 1 compliance"
**Cause:** No BOM items were provided in the wizard.
**Fix:** Add at least one BOM item with valid item code, quantity, and unit.

#### "Item is required for MES Phase 1 compliance"
**Cause:** Item creation failed during the wizard, usually because the specified units don't exist.
**Fix:** Check the error details for "Could not find units" — ensure the units ID exists in the system. The error will list available units.

#### "MES Phase 1 constraint violation: Production Order cannot have multiple container items (N provided)"
**Cause:** More than one container item was linked to the PrO.
**Fix:** Remove extra container items. Each PrO supports at most one container item.

#### "Recipe with ID {id} not found"
**Cause:** The recipe ID in the wizard doesn't match any recipe.
**Fix:** Verify the recipe exists. Check for typos in the recipe ID.

#### "Customer with code {code} not found"
**Cause:** The customer code doesn't match any customer record.
**Fix:** Verify the customer code. Customer lookup is by the `customerCode` field, not `name` or `id`.

### Schedule Order Grouping Failures

#### "Incompatible recipe groups: Production orders must have the same mash bill"
**Cause:** Attempting to group PrOs with different recipe groups (mash bills).
**Fix:** Only group PrOs whose recipes belong to the same recipe group. Check each PrO's recipe and its `recipeGroupId`.

#### "Production order {id} is already scheduled"
**Cause:** One or more PrOs already have `scheduleOrderId` set or `scheduled: true`.
**Fix:** Either deschedule the PrO from its current SchO first, or exclude it from the new group.

#### "No production orders provided"
**Cause:** Empty array of production order IDs.
**Fix:** Provide at least one valid production order ID.

### Cancellation Failures

#### "Cannot cancel a production order with status {status}. Only Planned or Initiated orders can be cancelled"
**Cause:** Trying to cancel a PrO that is Committed, InProgress, or Complete.
**Fix:** Orders past Initiated status are linked to active production. If the PrO is Committed, remove it from the schedule first (deschedule), then cancel.

#### "Cannot cancel — production order is linked to ScheduleOrder"
**Cause:** PrO has a `scheduleOrderId` set.
**Fix:** Deschedule the PrO from the SchO first, then cancel.

## Order Relationship Issues

### Production Orders Not Appearing Under Schedule Order

**Symptoms:** PrOs exist but don't show under a SchO.

**Check:**
1. `ProductionOrder.scheduleOrderId` — does it match the SchO ID?
2. `ProductionOrder.scheduled` — is it `true`?
3. Recipe group — does the PrO's recipe belong to the SchO's recipe group?

**Fix:** If the PrO was manually unlinked, re-add it to the SchO through the grouping service.

### Schedule Order Shows Wrong Customer List

**Symptoms:** SchO customer list doesn't match expected customers.

**Cause:** Customer M:N relationship is set at creation time from the PrOs' customers.

**Fix:** Customers are extracted from PrOs during SchO creation. If PrOs were added/removed after creation, the customer list may need manual update. Check `productionOrderAllocation` JSON for the expected customer breakdown.

### Orphaned Production Orders

**Symptoms:** PrOs have `scheduled: true` but `scheduleOrderId` is null, or the referenced SchO doesn't exist.

**Fix:**
1. Query for PrOs where `scheduled = true AND scheduleOrderId IS NULL`
2. Reset their status: set `scheduled: false`, `status: Initiated`
3. Re-group them into a new SchO if needed

## Recipe Instance Issues

### Schedule Order Missing Recipe Instance

**Symptoms:** SchO is active (position 0) but has no ScheduleOrderRecipeInstance.

**Possible causes:**
1. `totalGrainWeight` is 0 or null — SORI creation requires grain weight > 0
2. Transaction failed during SORI creation (check logs for errors)
3. SORI was deleted during a failed deschedule operation

**Fix:**
1. Set `totalGrainWeight` on the SchO to a positive value
2. If the SchO is still at position 0, trigger recipe instance creation manually
3. Check for transaction errors in the application logs

### BOM Quantities Not Calculating

**Symptoms:** RecipeBomActual records have null or zero `quantityPlanned`.

**Check:**
1. **Calculation mode** — `STATIC` items don't recalculate; they use the fixed quantity from the BOM item
2. **Load values** — `totalGrainWeight` (for `FORMULA_GRAIN`) and `totalWaterVolume` (for `FORMULA_WATER`) must be set
3. **Formula multiplier** — check `formulaMultiplier` is set on the RecipeBomItem
4. **Formula type** — must match the calculation mode

**Fix:** Update loads on the SchO via `updateLoads()`. This triggers automatic recalculation.

### BOM Mismatch Between Master and Instance

**Symptoms:** SORI BOM items don't match the master recipe BOM.

**Cause:** SORI BOM is a copy made at activation time. Changes to the master recipe after SORI creation are not automatically propagated.

**Fix:** If the master recipe was updated after SORI creation, the SORI must be recreated. This typically requires descheduling and rescheduling the SchO.

### Missing Mashing Protocol

**Symptoms:** SORI exists but has no mashing protocol.

**Cause:** Master recipe doesn't have a `mashingProtocolId` set, or the protocol has no steps.

**Fix:** Ensure the master recipe has a valid mashing protocol with steps before activating the SchO.

## Queue Management Issues

### Queue Index Conflicts

**Symptoms:** "Unique constraint violation: Another item may already exist at index X"

**Cause:** Concurrent queue reorder operations, or a race condition during index swapping.

**Fix:** The system retries automatically (3 attempts with exponential backoff). If the error persists:
1. Wait a moment and retry the operation
2. Check for stuck transactions via database monitoring
3. Verify no other user is reordering the same queue simultaneously

### "The operation was interrupted due to concurrent changes"

**Cause:** Transaction aborted due to concurrent modification (Prisma error P2034 or PostgreSQL 25P02).

**Fix:** Retry the operation. This is expected behavior under high concurrency.

### Stuck Order at Position 0

**Symptoms:** Active order can't be completed or advanced.

**Check:**
1. SchO status — is it actually InProgress?
2. Queue entry exists — verify `ScheduleOrderQueue` record for this SchO
3. Queue index — confirm it's 0

**Fix:** Use `advanceScheduleOrderQueue()` to complete the active order and move to the next. This deletes the queue entry, marks the SchO as Complete, and decrements all remaining indices.

### Cannot Deactivate Order

**Symptoms:** "Cannot deactivate schedule order queue with index X. Index must be greater than 1"

**Cause:** Attempting to deactivate an order at position 0 (active) or 1 (next up).

**Fix:** Only orders at position 2+ can be deactivated. For position 0, use advance. For position 1, either reorder it to a higher position first, or deschedule the SchO entirely.

### Queue Gap After Deletion

**Symptoms:** Queue indices have gaps (e.g., 0, 1, 3, 5).

**Cause:** Resequencing failed after a deletion.

**Fix:** The system auto-resequences after deletions. If gaps persist, check for failed transactions. Manually resequencing may be needed via direct database update.

## ERP Integration Issues

### NetSuite Sync Failures

**Symptoms:** Item or order not appearing in NetSuite.

**Check:**
1. RabbitMQ connection — is the message broker running?
2. Event emission — check if `create` or `update` events were published
3. Sync service logs — look for errors in the `sync` module
4. Item classification — verify `itemClass` (Assembly) and `itemGroup` (FG-BBL or FG-DIS) are set

**Fix:**
1. Verify RabbitMQ is connected: check the `rabbitmq` module health
2. Retry the sync by updating the order (triggers a new event)
3. Check the sync service for specific NetSuite API errors

### Duplicate Item Numbers

**Symptoms:** Item creation fails due to unique constraint on item number.

**Cause:** An item with the same generated number already exists. This is expected — the system reuses existing items.

**Fix:** This is not an error. The `createOrFindItem()` method checks for existing items first and reuses them. If you need a new item, one of the dimensions (customer, mash bill, container, proof) must differ.

### ERP ID Generation

**Symptoms:** Item missing ERP ID.

**Fix:** Items created by the wizard automatically get `erpId: ERP-{itemNumber}`. If missing, update the item record.

## Performance Issues

### Slow Order Creation

**Symptoms:** Wizard takes > 30 seconds.

**Possible causes:**
1. Database connection latency (remote DB)
2. Many BOM items to create
3. Auto-schedule creating SchO + queue entry

**Fix:**
1. Check database response time
2. Phase 2 transaction has a 30-second timeout — if exceeded, the operation fails
3. Auto-scheduling is Phase 3 (separate transaction) and non-blocking for PrO creation

### Slow Queue Operations

**Symptoms:** Queue reorder or advance takes multiple seconds.

**Cause:**
1. Swap-based algorithm requires multiple database operations
2. Retry logic adds delays (exponential backoff up to 5 seconds per retry)
3. Concurrent access from multiple users

**Fix:**
1. Queue operations use `ReadCommitted` isolation for better concurrency
2. Reduce concurrent queue modifications
3. Check for long-running transactions holding locks

### Large Schedule Order Queries

**Symptoms:** Fetching SchO with all relationships is slow.

**Fix:** Use selective includes in GraphQL queries. Only request the relationships you need (e.g., skip `scheduleOrderRecipeInstance` if you only need summary data).

## Escalation Procedures

### When to Escalate

Escalate to the development team when:
- **Data inconsistency**: PrO/SchO records in impossible states (e.g., `scheduled: true` with no `scheduleOrderId`)
- **Transaction failures**: Repeated transaction timeouts or deadlocks
- **Queue corruption**: Queue indices in invalid states that can't be resolved by resequencing
- **Recipe instance failures**: SORI creation consistently fails despite valid input data
- **ERP sync failures**: Persistent NetSuite sync failures after RabbitMQ verification

### Information to Include

When escalating, provide:
1. **Entity IDs**: PrO ID, SchO ID, queue entry ID
2. **Current state**: Status, queue position, relationship links
3. **Expected state**: What should the values be
4. **Error messages**: Exact error text from logs or API responses
5. **Timeline**: When the issue started, what operations preceded it
6. **Application logs**: Relevant log entries from the NestJS backend

### Emergency Recovery

For critical production blocking issues:
1. **Queue stuck**: Can be manually resequenced via Prisma Studio (`npx prisma studio`)
2. **Status reset**: Production Order status can be manually set to `Initiated` to allow re-scheduling
3. **SORI recreation**: Delete the SORI and trigger recreation by re-activating the queue position
4. **Database rollback**: Contact the DBA for point-in-time recovery if data corruption occurred

---

*See also: [Quick Reference](./quick-reference.md) | [Architecture](./architecture.md) | [Order Relationships](./order-relationships.md)*
