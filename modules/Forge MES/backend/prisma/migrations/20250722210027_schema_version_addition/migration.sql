-- Idempotent add of "schemaVersion" to many tables (PostgreSQL)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'User',
    'UnsConfiguration',
    'UnsBrokerConfiguration',
    'UnitLookup',
    'ScheduleOrder',
    'RecipeBomItem',
    'RecipeBomActual',
    'RecipeBom',
    'ProductionOrderRecipeInstance',
    'ProductionOrderBomItem',
    'MashingProtocol',
    'MashingProtocolStep',
    'MashingProtocolStepActual',
    'MessageQueue',
    'ItemGroup',
    'InventoryTransfer',
    'InventoryLog',
    'ItemReceipt',
    'Inventory',
    'Inventory',
    'Lot',
    'Batch',
    'AdditiveActual',
    'Bom',
    'BomItem',
    'PurchaseOrder',
    'SalesOrder',
    'Customer',
    'Vendor',
    'Test',
    'Notification',
    'Comment'
    -- add any remaining tables you need here
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Add column if it doesn't already exist
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = t
        AND column_name  = 'schemaVersion'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN %I TEXT', t, 'schemaVersion');
    END IF;

    -- Optional: backfill NULLs to a default value (e.g., 'v1')
    -- EXECUTE format('UPDATE %I SET "schemaVersion" = COALESCE("schemaVersion", %L)', t, 'v1');
  END LOOP;
END$$;
