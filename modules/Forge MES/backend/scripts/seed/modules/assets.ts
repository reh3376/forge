import {
  PrismaClient,
  EnumAssetAssetType,
  EnumEquipmentOperationalState,
} from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const assetsModule: SeedModule = {
  name: "assets",
  description: "Facility assets and equipment hierarchy",
  dependencies: [],
  priority: SEED_PRIORITIES.CORE_CONFIG,
  enabled: true,

  runner: async (
    client: PrismaClient,
    config: SeedConfig
  ): Promise<SeedResult> => {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    let recordsCreated = 0;
    let recordsUpdated = 0;

    try {
      console.log("  └─ Seeding assets with FK hierarchy...");

      // Check existing assets
      const existingCount = await client.asset.count();
      if (existingCount > 0 && config.skipExistingData) {
        console.log(`    Found ${existingCount} existing assets, skipping`);
        return {
          success: true,
          message: `Skipped - ${existingCount} assets already exist`,
          recordsCreated: 0,
          recordsUpdated: 0,
          errors: [],
          warnings: [],
          executionTimeMs: Date.now() - startTime,
        };
      }

      if (existingCount === 0) {
        // Step 1: Create site (top-level parent)
        const siteAsset = await client.asset.create({
          data: {
            assetPath: "WHK/SITE-001",
            assetType: EnumAssetAssetType.SITE,
            name: "WhiskeyHouse Main Distillery",
            description: "Primary production facility",
            createdBy: "system",
          },
        });
        recordsCreated++;
        console.log(`    Created site asset: ${siteAsset.name}`);

        // Step 2: Create areas (children of site)
        const areaAssets = await Promise.all([
          client.asset.create({
            data: {
              assetPath: "WHK/SITE-001/AREA-MASH",
              assetType: EnumAssetAssetType.AREA,
              name: "Mashing Area",
              description: "Grain processing and mashing operations",
              parentId: siteAsset.id,
              createdBy: "system",
            },
          }),
          client.asset.create({
            data: {
              assetPath: "WHK/SITE-001/AREA-DIST",
              assetType: EnumAssetAssetType.AREA,
              name: "Distillation Area",
              description: "Distillation and rectification operations",
              parentId: siteAsset.id,
              createdBy: "system",
            },
          }),
          client.asset.create({
            data: {
              assetPath: "WHK/SITE-001/AREA-FERM",
              assetType: EnumAssetAssetType.AREA,
              name: "Fermentation Area",
              description: "Fermentation tanks and operations",
              parentId: siteAsset.id,
              createdBy: "system",
            },
          }),
          client.asset.create({
            data: {
              assetPath: "WHK/SITE-001/AREA-AGE",
              assetType: EnumAssetAssetType.AREA,
              name: "Aging Warehouses",
              description: "Barrel aging and storage facilities",
              parentId: siteAsset.id,
              createdBy: "system",
            },
          }),
        ]);
        recordsCreated += areaAssets.length;
        console.log(
          `    Created ${areaAssets.length} area assets with site FK links`
        );

        // Step 3: Create lines (children of areas)
        const mashArea = areaAssets.find((a) => a.name === "Mashing Area");
        const distArea = areaAssets.find((a) => a.name === "Distillation Area");

        const lineAssets = await Promise.all([
          client.asset.create({
            data: {
              assetPath: "WHK/SITE-001/AREA-MASH/LINE-001",
              assetType: EnumAssetAssetType.LINE,
              name: "Mash Line 1",
              description: "Primary mashing production line",
              parentId: mashArea!.id,
              createdBy: "system",
            },
          }),
          client.asset.create({
            data: {
              assetPath: "WHK/SITE-001/AREA-DIST/LINE-001",
              assetType: EnumAssetAssetType.LINE,
              name: "Distillation Line 1",
              description: "Primary distillation line",
              parentId: distArea!.id,
              createdBy: "system",
            },
          }),
        ]);
        recordsCreated += lineAssets.length;
        console.log(
          `    Created ${lineAssets.length} line assets with area FK links`
        );

        // Step 4: Create units (children of areas)
        const fermArea = areaAssets.find((a) => a.name === "Fermentation Area");
        const ageArea = areaAssets.find((a) => a.name === "Aging Warehouses");

        // Create 14 fermentation tanks (F001–F014)
        const fermenterPromises = [];
        for (let i = 1; i <= 14; i++) {
          const num = String(i).padStart(3, "0");
          fermenterPromises.push(
            client.asset.create({
              data: {
                assetPath: `WHK/SITE-001/AREA-FERM/TANK-F${num}`,
                assetType: EnumAssetAssetType.UNIT,
                name: `Fermentation Tank F${num}`,
                description: "10,000 gallon fermentation vessel",
                parentId: fermArea!.id,
                operationalState: EnumEquipmentOperationalState.Available,
                isTrackedUnit: true,
                createdBy: "system",
              },
            })
          );
        }
        const fermenterAssets = await Promise.all(fermenterPromises);
        recordsCreated += fermenterAssets.length;
        console.log(
          `    Created ${fermenterAssets.length} fermentation tanks (F001–F014)`
        );

        // Create other unit assets
        const otherUnitAssets = await Promise.all([
          client.asset.create({
            data: {
              assetPath: "WHK/SITE-001/AREA-DIST/STILL-001",
              assetType: EnumAssetAssetType.UNIT,
              name: "Column Still 001",
              description: "Primary distillation column",
              parentId: distArea!.id,
              createdBy: "system",
            },
          }),
          client.asset.create({
            data: {
              assetPath: "WHK/SITE-001/AREA-AGE/WH-001",
              assetType: EnumAssetAssetType.UNIT,
              name: "Aging Warehouse 1",
              description: "Climate controlled barrel storage",
              parentId: ageArea!.id,
              createdBy: "system",
            },
          }),
          client.asset.create({
            data: {
              assetPath: "WHK/SITE-001/AREA-MASH/SILO-CORN",
              assetType: EnumAssetAssetType.UNIT,
              name: "Corn Silo",
              description: "Bulk corn grain storage silo",
              parentId: mashArea!.id,
              createdBy: "system",
            },
          }),
          client.asset.create({
            data: {
              assetPath: "WHK/SITE-001/AREA-MASH/SILO-RYE",
              assetType: EnumAssetAssetType.UNIT,
              name: "Rye Silo",
              description: "Bulk rye grain storage silo",
              parentId: mashArea!.id,
              createdBy: "system",
            },
          }),
        ]);
        recordsCreated += otherUnitAssets.length;
        console.log(
          `    Created ${otherUnitAssets.length} other unit assets with area FK links`
        );
      } else {
        console.log(
          `    Skipped creating assets - ${existingCount} already exist`
        );
      }

      return {
        success: true,
        message:
          recordsCreated > 0
            ? `Successfully created ${recordsCreated} assets`
            : "Skipped - assets already exist",
        recordsCreated,
        recordsUpdated,
        errors,
        warnings,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown error in assets seeding";
      errors.push(errorMessage);

      return {
        success: false,
        message: errorMessage,
        recordsCreated,
        recordsUpdated,
        errors,
        warnings,
        executionTimeMs: Date.now() - startTime,
      };
    }
  },

  validator: async (client: PrismaClient): Promise<ValidationResult> => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let recordsValidated = 0;

    try {
      // Validate assets exist
      const assetsCount = await client.asset.count();
      recordsValidated += assetsCount;

      if (assetsCount < 20) {
        errors.push(
          `Insufficient assets: ${assetsCount} (expected at least 20 including 14 fermenters)`
        );
      }

      // Check for site asset
      const siteAssets = await client.asset.count({
        where: { assetType: EnumAssetAssetType.SITE },
      });
      if (siteAssets < 1) {
        errors.push(`Missing site asset (expected at least 1)`);
      }

      // Check for production areas
      const areaAssets = await client.asset.count({
        where: { assetType: EnumAssetAssetType.AREA },
      });
      if (areaAssets < 3) {
        warnings.push(
          `Few production areas: ${areaAssets} (expected at least 3)`
        );
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        recordsValidated,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [
          `Validation failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        ],
        warnings,
        recordsValidated,
      };
    }
  },
};
