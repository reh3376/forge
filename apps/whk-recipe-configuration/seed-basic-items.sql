-- Simple Items and Vendors Migration
-- This creates basic items and vendors with correct schema

BEGIN;

-- Insert Vendors
INSERT INTO "Vendor" (
    "id",
    "name",
    "erpId",
    "active",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy"
) VALUES
('vendor-grain-supply-001', 'Prairie Grain Cooperative', 'VEND-001', true, NOW(), 'system-migration', NOW(), 'system-migration'),
('vendor-yeast-supply-001', 'Lallemand Distilling', 'VEND-002', true, NOW(), 'system-migration', NOW(), 'system-migration'),
('vendor-enzyme-supply-001', 'Novozymes Biologicals', 'VEND-003', true, NOW(), 'system-migration', NOW(), 'system-migration')
ON CONFLICT ("erpId") DO NOTHING;

-- Insert Customers
INSERT INTO "Customer" (
    "id",
    "name",
    "address",
    "customerCode",
    "createdAt",
    "createdBy",
    "updatedAt",
    "revision"
) VALUES
('customer-house-brand-001', 'House Brand Whiskey', '123 Distillery Row, Louisville, KY 40202', 'CUST-001', NOW(), 'system-migration', NOW(), 0),
('customer-private-label-001', 'Premium Private Label Co', '456 Bourbon Street, Bardstown, KY 40004', 'CUST-002', NOW(), 'system-migration', NOW(), 0)
ON CONFLICT ("id") DO NOTHING;

-- Insert Items
INSERT INTO "Item" (
    "id",
    "itemNumber",
    "itemName",
    "itemDescription",
    "itemType",
    "itemClass",
    "itemGroup",
    "erpId",
    "active",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy",
    "itemRevision",
    "vendorId"
) VALUES
-- Raw Materials - Grains
('item-corn-001', 'RM-CORN-001', 'Corn #2 Yellow Dent', 'Premium #2 Yellow Dent Corn for Bourbon Production', 'RawMaterial', 'Grain', 'Corn', 'ERP-RM-001', true, NOW(), 'system-migration', NOW(), 'system-migration', 0, 'vendor-grain-supply-001'),
('item-rye-001', 'RM-RYE-001', 'Rye Grain', 'High Quality Rye Grain for Flavoring', 'RawMaterial', 'Grain', 'Rye', 'ERP-RM-002', true, NOW(), 'system-migration', NOW(), 'system-migration', 0, 'vendor-grain-supply-001'),
('item-wheat-001', 'RM-WHEAT-001', 'Winter Wheat', 'Soft Winter Wheat for Wheated Bourbon', 'RawMaterial', 'Grain', 'Wheat', 'ERP-RM-003', true, NOW(), 'system-migration', NOW(), 'system-migration', 0, 'vendor-grain-supply-001'),
('item-malt-001', 'RM-MALT-001', 'Malted Barley', '2-Row Malted Barley for Enzyme Activity', 'RawMaterial', 'Grain', 'Malt', 'ERP-RM-004', true, NOW(), 'system-migration', NOW(), 'system-migration', 0, 'vendor-grain-supply-001'),

-- Yeast and Enzymes
('item-yeast-001', 'RM-YEAST-001', 'DistilaMax MW', 'Lallemand DistilaMax MW Distilling Yeast', 'RawMaterial', 'Yeast', 'Yeast', 'ERP-RM-005', true, NOW(), 'system-migration', NOW(), 'system-migration', 0, 'vendor-yeast-supply-001'),
('item-enzyme-liq-001', 'RM-ENZ-001', 'Liquozyme SC DS', 'Novozymes Alpha-Amylase for Liquefaction', 'RawMaterial', 'Enzyme', 'Enzymes', 'ERP-RM-006', true, NOW(), 'system-migration', NOW(), 'system-migration', 0, 'vendor-enzyme-supply-001'),

-- Finished Goods
('item-bourbon-rye-001', 'FG-BOURBON-001', 'Premium Rye Bourbon', 'High Rye Bourbon Whiskey - House Brand', 'FinishedGood', 'Whiskey', 'Bourbon', 'ERP-FG-001', true, NOW(), 'system-migration', NOW(), 'system-migration', 0, NULL)

ON CONFLICT ("erpId") DO NOTHING;

COMMIT;