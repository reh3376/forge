# Audited Entities

This document lists all entities that are automatically audited by the audit middleware system. The audit system captures CREATE, UPDATE, and DELETE operations for these entities without requiring any changes to existing service code.

## Configuration Models

These models control system behavior and configuration settings:

- **EnzymeConfiguration** - Enzyme dosing configurations for production
- **SystemConfiguration** - Global system settings and parameters
- **EnzymeCalculationRule** - Rules for enzyme calculation logic
- **MillingBinConfiguration** - Milling equipment configuration
- **UnsConfiguration** - UNS (Unified Namespace) configuration
- **UnsBrokerConfiguration** - UNS broker connection settings
- **Units** - Unit of measure definitions and conversions

## Recipe and Production Models

Core recipe management and production planning entities:

- **Recipe** - Master recipes for production
- **RecipeGroup** - Recipe categorization and grouping
- **RecipeParameter** - Recipe-specific parameters and setpoints
- **RecipeBom** - Recipe bill of materials
- **RecipeBomItem** - Individual items in recipe BOMs
- **RecipeBomActual** - Actual values used in production vs. recipe
- **MashingProtocol** - Mashing process protocols
- **MashingProtocolStep** - Individual steps in mashing protocols
- **MashingProtocolStepActual** - Actual execution data for mashing steps

## Production Order Models

Production execution and scheduling entities:

- **ProductionOrder** - Production orders for manufacturing
- **ProductionOrderBomItem** - BOM items specific to production orders
- **ProductionOrderRecipeInstance** - Recipe instances used in production
- **ScheduleOrder** - Scheduled production orders
- **ScheduleOrderQueue** - Production order queue management

## Equipment and Process Models

Equipment configuration and process definition entities:

- **Operation** - Manufacturing operations
- **Procedure** - Standard operating procedures
- **UnitProcedure** - Unit-specific procedures
- **EquipmentPhase** - Equipment phase definitions
- **PhaseParameter** - Parameters for equipment phases
- **TestParameter** - Quality testing parameters
- **Instruction** - Work instructions and documentation

## Inventory and Materials

Material management and inventory tracking entities:

- **Item** - Raw materials, ingredients, and finished goods
- **ItemGroup** - Item categorization and grouping
- **ItemReceipt** - Material receipts and incoming inventory
- **Inventory** - Current inventory levels and locations
- **InventoryLog** - Inventory movement history
- **InventoryTransfer** - Inventory transfers between locations
- **Lot** - Lot tracking for traceability
- **Batch** - Production batch information
- **AdditiveActual** - Actual additive usage in production

## BOM and Structure

Bill of materials and product structure entities:

- **Bom** - Bill of materials definitions
- **BomItem** - Individual items in BOMs

## Orders and Customers

Commercial and procurement entities:

- **PurchaseOrder** - Purchase orders for procurement
- **SalesOrder** - Customer sales orders
- **Customer** - Customer master data
- **Vendor** - Supplier and vendor information

## Assets and Equipment

Physical asset and equipment management:

- **Asset** - Physical assets and equipment
- **UnitLookup** - Equipment unit definitions

## Testing and Quality

Quality control and testing entities:

- **Test** - Quality tests and specifications

## Communication and Messaging

System communication and messaging entities:

- **MessageQueue** - Message queue management
- **MqttMessage** - MQTT message logging
- **MqttTagMapping** - MQTT tag mapping configuration

## User Interface and Notifications

User interface and notification entities:

- **Dashboard** - User dashboard configurations
- **Widget** - Dashboard widget definitions
- **Notification** - System notifications
- **Comment** - User comments and notes

## Excluded Entities

The following entities are **NOT** audited to avoid issues:

- **User** - Excluded to prevent circular references in audit logs (User changes can be audited separately if needed)
- **AuditLog** - The audit log table itself is not audited to prevent infinite recursion

## Audit Information Captured

For each audited entity, the following information is automatically captured:

- **Entity Type** - The model name (e.g., "Recipe", "ProductionOrder")
- **Entity ID** - The unique identifier of the changed record
- **Action** - CREATE, UPDATE, or DELETE
- **Old Values** - Previous values before the change (for UPDATE and DELETE)
- **New Values** - New values after the change (for CREATE and UPDATE)
- **User ID** - Who made the change
- **IP Address** - Source IP address of the request
- **User Agent** - Browser/client information
- **Timestamp** - When the change occurred

## Performance Considerations

- The audit middleware only captures changes for the specified models
- For UPDATE operations, only changed fields are stored to minimize storage
- Audit logging failures do not affect the main database operations
- Indexes are in place for efficient querying of audit logs

## Configuration

To modify which entities are audited, update the `AUDITABLE_MODELS` array in:
`src/audit/audit-middleware.service.ts`

## Usage

Audit logging happens automatically - no code changes are required in services. To query audit logs, use the `AuditService` or the `/audit` API endpoints.

Example:

```typescript
// Get audit history for a specific recipe
const history = await auditService.getEntityAuditHistory("Recipe", "recipe-id");

// Get all changes by a specific user
const userChanges = await auditService.getUserAuditHistory("user-id");
```
