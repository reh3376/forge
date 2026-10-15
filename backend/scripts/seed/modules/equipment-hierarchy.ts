/**
 * CMMS-aligned equipment hierarchy seed module.
 *
 * Reorganizes the WHK01 distillery asset hierarchy to match the CMMS
 * (Computerized Maintenance Management System) export. Sets `isTrackedUnit`
 * on recipe-bound vessels so only those appear in operator equipment grids.
 *
 * Idempotent — safe to re-run. Uses upsert-style logic (find-or-create,
 * update-if-exists).
 *
 * Production areas (flow order):
 *   Cooking → Fermentation → Distillation → Distillate Storage → Blending → Barreling
 */
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

// ─── Asset definitions ──────────────────────────────────────────

interface TrackedUnit {
  /** Asset path suffix (appended to area path) */
  pathSuffix: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
}

/** Rename definition — optionally marks asset as non-tracked (minor vessel) */
interface RenameEntry {
  name: string;
  /** When true, this asset is NOT shown in operator equipment grids (default: false → tracked) */
  nonTracked?: boolean;
}

interface AreaDefinition {
  /** Area asset path */
  areaPath: string;
  /** Create the area if it doesn't exist? (false = must already exist) */
  createIfMissing: boolean;
  /** Display name for area */
  areaName: string;
  /** Description */
  areaDescription: string;
  /** Parent area path (only used if createIfMissing) */
  parentPath?: string;
  /** Rename mappings: oldAssetPath → rename config (with optional nonTracked flag) */
  renames?: Record<string, RenameEntry>;
  /** New tracked units to create */
  units?: TrackedUnit[];
  /** Mark ALL existing children as tracked (e.g., fermenters) */
  markAllChildrenTracked?: boolean;
  /** Assets to move INTO this area: { fromPath → newName } */
  moveIn?: Record<string, { name: string }>;
}

const AREA_DEFINITIONS: AreaDefinition[] = [
  // ─── Cooking (internal path: Mashing01) ──────────────────────
  {
    areaPath: "WH/WHK01/Distillery01/Mashing01",
    createIfMissing: false,
    areaName: "Mashing01",
    areaDescription: "Cooking area — cookers, drop tub, mash cooler",
    renames: {
      "WH/WHK01/Distillery01/Mashing01/T-200": { name: "Cooker 1" },
      "WH/WHK01/Distillery01/Mashing01/T-201": { name: "Cooker 2" },
      "WH/WHK01/Distillery01/Mashing01/T-202": {
        name: "Drop Tub",
        nonTracked: true,
      },
      "WH/WHK01/Distillery01/Mashing01/T-204": {
        name: "Mash Cooler",
        nonTracked: true,
      },
    },
  },

  // ─── Fermentation ────────────────────────────────────────────
  {
    areaPath: "WH/WHK01/Distillery01/Fermentation01",
    createIfMissing: false,
    areaName: "Fermentation01",
    areaDescription: "Fermentation area — 14 fermenters + beer well",
    markAllChildrenTracked: true,
    units: [
      {
        pathSuffix: "BeerWell",
        name: "Beer Well",
        description: "Beer Well — collection tank before distillation",
      },
    ],
  },

  // ─── Distillation ────────────────────────────────────────────
  {
    areaPath: "WH/WHK01/Distillery01/Distillation01",
    createIfMissing: false,
    areaName: "Distillation01",
    areaDescription: "Distillation area — still, doubler, flash tank",
    renames: {
      "WH/WHK01/Distillery01/Distillation01/C-401": { name: "Still" },
      "WH/WHK01/Distillery01/Distillation01/C-410": { name: "Doubler" },
      "WH/WHK01/Distillery01/Distillation01/S-430": {
        name: "Spirit Safe",
        nonTracked: true,
      },
      "WH/WHK01/Distillery01/Distillation01/T-4057": {
        name: "Flash Tank",
        nonTracked: true,
      },
      "WH/WHK01/Distillery01/Distillation01/T-413": {
        name: "Heads & Tails Tank",
        nonTracked: true,
      },
      "WH/WHK01/Distillery01/Distillation01/T-414": {
        name: "High Wine Tank",
        nonTracked: true,
      },
    },
  },

  // ─── Distillate Storage (cisterns) ───────────────────────────
  {
    areaPath: "WH/WHK01/Distillery01/DistillateStorage01",
    createIfMissing: true,
    areaName: "DistillateStorage01",
    areaDescription: "Distillate Storage — Cistern Tanks",
    parentPath: "WH/WHK01/Distillery01",
    moveIn: {
      "WH/WHK01/Distillery01/Distillation01/T-430": {
        name: "Cistern Tank 1",
      },
      "WH/WHK01/Distillery01/Distillation01/T-431": {
        name: "Cistern Tank 2",
      },
      "WH/WHK01/Distillery01/Distillation01/T-432": {
        name: "Cistern Tank 3",
      },
    },
  },

  // ─── Blending ────────────────────────────────────────────────
  {
    areaPath: "WH/WHK01/Distillery01/Blending01",
    createIfMissing: true,
    areaName: "Blending01",
    areaDescription: "Blending — Blend Tanks",
    parentPath: "WH/WHK01/Distillery01",
    moveIn: {
      "WH/WHK01/Distillery01/Distillation01/T-434": {
        name: "Blend Tank 1",
      },
      "WH/WHK01/Distillery01/Distillation01/T-435": {
        name: "Blend Tank 2",
      },
    },
  },

  // ─── Barreling ───────────────────────────────────────────────
  {
    areaPath: "WH/WHK01/Distillery01/Processing01/Barreling01",
    createIfMissing: false,
    areaName: "Barreling01",
    areaDescription: "Barreling area — carousel, fillers, storage tanks",
    units: [
      {
        pathSuffix: "Carousel",
        name: "Barrel Carousel",
        description: "Barrel Carousel",
      },
      {
        pathSuffix: "LargeFiller",
        name: "Large Barrel Filler",
        description: "Large Barrel Filler",
      },
      {
        pathSuffix: "SmallFiller",
        name: "Small Barrel Filler",
        description: "Small Barrel Filler",
      },
      {
        pathSuffix: "PST-1",
        name: "Portable Storage Tank 1",
        description: "Portable Storage Tank 1",
      },
      {
        pathSuffix: "PST-2",
        name: "Portable Storage Tank 2",
        description: "Portable Storage Tank 2",
      },
      {
        pathSuffix: "PST-3",
        name: "Portable Storage Tank 3",
        description: "Portable Storage Tank 3",
      },
    ],
  },
];

// ─── Non-tracked assets in Distillation01 (rename only) ─────
const DISTILLATION_NON_TRACKED_RENAMES: Record<string, string> = {
  "WH/WHK01/Distillery01/Distillation01/T-421": "Backset Tank",
  "WH/WHK01/Distillery01/Distillation01/T-422": "Thick Slop Surge Tank",
};

// ─── Runner ─────────────────────────────────────────────────────

export const equipmentHierarchyModule: SeedModule = {
  name: "equipment-hierarchy",
  description:
    "CMMS-aligned equipment hierarchy with isTrackedUnit flags (idempotent)",
  dependencies: ["assets"],
  priority: SEED_PRIORITIES.CORE_CONFIG,
  enabled: true,

  runner: async (
    client: PrismaClient,
    _config: SeedConfig
  ): Promise<SeedResult> => {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    let recordsCreated = 0;
    let recordsUpdated = 0;

    try {
      console.log("  └─ Applying CMMS-aligned equipment hierarchy...");

      for (const areaDef of AREA_DEFINITIONS) {
        // Resolve or create area
        let area = await client.asset.findUnique({
          where: { assetPath: areaDef.areaPath },
        });

        if (!area && areaDef.createIfMissing && areaDef.parentPath) {
          const parent = await client.asset.findUnique({
            where: { assetPath: areaDef.parentPath },
          });
          if (!parent) {
            warnings.push(
              `Parent ${areaDef.parentPath} not found, skipping ${areaDef.areaName}`
            );
            continue;
          }
          area = await client.asset.create({
            data: {
              name: areaDef.areaName,
              assetPath: areaDef.areaPath,
              assetType: EnumAssetAssetType.AREA,
              description: areaDef.areaDescription,
              parentId: parent.id,
              createdBy: "system",
              operationalState: EnumEquipmentOperationalState.Available,
              isTrackedUnit: false,
            },
          });
          recordsCreated++;
          console.log(`    Created area: ${areaDef.areaName}`);
        } else if (!area) {
          warnings.push(
            `Area ${areaDef.areaPath} not found, skipping ${areaDef.areaName}`
          );
          continue;
        }

        // Mark all children as tracked
        if (areaDef.markAllChildrenTracked) {
          const result = await client.asset.updateMany({
            where: { parentId: area.id },
            data: { isTrackedUnit: true },
          });
          recordsUpdated += result.count;
          console.log(
            `    ${areaDef.areaName}: marked ${result.count} existing children as tracked`
          );
        }

        // Rename existing assets and set tracked status
        if (areaDef.renames) {
          for (const [path, update] of Object.entries(areaDef.renames)) {
            const asset = await client.asset.findUnique({
              where: { assetPath: path },
            });
            if (asset) {
              await client.asset.update({
                where: { id: asset.id },
                data: {
                  name: update.name,
                  isTrackedUnit: !update.nonTracked,
                },
              });
              recordsUpdated++;
            } else {
              warnings.push(`Rename target not found: ${path}`);
            }
          }
          console.log(
            `    ${areaDef.areaName}: renamed ${
              Object.keys(areaDef.renames).length
            } assets`
          );
        }

        // Move assets from other areas into this one
        if (areaDef.moveIn) {
          for (const [fromPath, update] of Object.entries(areaDef.moveIn)) {
            const asset = await client.asset.findUnique({
              where: { assetPath: fromPath },
            });
            if (asset) {
              const newPath = `${areaDef.areaPath}/${fromPath
                .split("/")
                .pop()}`;
              // Check if already moved (path already updated)
              if (asset.parentId === area.id) {
                // Already in correct area, just ensure name + tracked
                await client.asset.update({
                  where: { id: asset.id },
                  data: { name: update.name, isTrackedUnit: true },
                });
              } else {
                await client.asset.update({
                  where: { id: asset.id },
                  data: {
                    parentId: area.id,
                    assetPath: newPath,
                    name: update.name,
                    isTrackedUnit: true,
                  },
                });
              }
              recordsUpdated++;
            } else {
              // Check if already at destination path
              const destPath = `${areaDef.areaPath}/${fromPath
                .split("/")
                .pop()}`;
              const existing = await client.asset.findUnique({
                where: { assetPath: destPath },
              });
              if (existing) {
                await client.asset.update({
                  where: { id: existing.id },
                  data: { name: update.name, isTrackedUnit: true },
                });
                recordsUpdated++;
              } else {
                warnings.push(`Move source not found: ${fromPath}`);
              }
            }
          }
          console.log(
            `    ${areaDef.areaName}: moved in ${
              Object.keys(areaDef.moveIn).length
            } assets`
          );
        }

        // Create new unit assets
        if (areaDef.units) {
          for (const unit of areaDef.units) {
            const unitPath = `${areaDef.areaPath}/${unit.pathSuffix}`;
            const existing = await client.asset.findUnique({
              where: { assetPath: unitPath },
            });
            if (!existing) {
              await client.asset.create({
                data: {
                  name: unit.name,
                  assetPath: unitPath,
                  assetType: EnumAssetAssetType.UNIT,
                  description: unit.description,
                  parentId: area.id,
                  createdBy: "system",
                  operationalState: EnumEquipmentOperationalState.Available,
                  isTrackedUnit: true,
                },
              });
              recordsCreated++;
            } else {
              await client.asset.update({
                where: { id: existing.id },
                data: { name: unit.name, isTrackedUnit: true },
              });
              recordsUpdated++;
            }
          }
          console.log(
            `    ${areaDef.areaName}: ensured ${areaDef.units.length} units exist`
          );
        }
      }

      // Rename non-tracked distillation assets
      for (const [path, newName] of Object.entries(
        DISTILLATION_NON_TRACKED_RENAMES
      )) {
        const asset = await client.asset.findUnique({
          where: { assetPath: path },
        });
        if (asset) {
          await client.asset.update({
            where: { id: asset.id },
            data: { name: newName, isTrackedUnit: false },
          });
          recordsUpdated++;
        }
      }

      // Summary
      const trackedCount = await client.asset.count({
        where: { isTrackedUnit: true },
      });
      console.log(
        `    Total tracked units: ${trackedCount} (created ${recordsCreated}, updated ${recordsUpdated})`
      );

      return {
        success: true,
        message: `Equipment hierarchy applied: ${trackedCount} tracked units across 6 areas`,
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
          : "Unknown error in equipment-hierarchy seeding";
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
      const trackedCount = await client.asset.count({
        where: { isTrackedUnit: true },
      });
      recordsValidated = trackedCount;

      if (trackedCount < 24) {
        errors.push(
          `Only ${trackedCount} tracked units (expected at least 24 for 6 production areas)`
        );
      }

      // Check each expected area has tracked children
      const expectedAreas = [
        {
          path: "WH/WHK01/Distillery01/Mashing01",
          label: "Cooking",
          minUnits: 2,
        },
        {
          path: "WH/WHK01/Distillery01/Fermentation01",
          label: "Fermentation",
          minUnits: 14,
        },
        {
          path: "WH/WHK01/Distillery01/Distillation01",
          label: "Distillation",
          minUnits: 2,
        },
        {
          path: "WH/WHK01/Distillery01/DistillateStorage01",
          label: "Distillate Storage",
          minUnits: 2,
        },
        {
          path: "WH/WHK01/Distillery01/Blending01",
          label: "Blending",
          minUnits: 2,
        },
        {
          path: "WH/WHK01/Distillery01/Processing01/Barreling01",
          label: "Barreling",
          minUnits: 3,
        },
      ];

      for (const area of expectedAreas) {
        const areaAsset = await client.asset.findUnique({
          where: { assetPath: area.path },
        });
        if (!areaAsset) {
          warnings.push(`Area ${area.label} (${area.path}) not found`);
          continue;
        }
        const unitCount = await client.asset.count({
          where: { parentId: areaAsset.id, isTrackedUnit: true },
        });
        if (unitCount < area.minUnits) {
          warnings.push(
            `${area.label}: ${unitCount} tracked units (expected >= ${area.minUnits})`
          );
        }
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
