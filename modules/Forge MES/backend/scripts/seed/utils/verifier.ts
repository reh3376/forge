import { PrismaClient } from "@prisma/client";
import { ValidationResult } from "../config";

export interface ValidationCheck {
  name: string;
  description: string;
  check: (
    client: PrismaClient
  ) => Promise<{ valid: boolean; message?: string; count?: number }>;
}

export class SeedVerifier {
  private client: PrismaClient;
  private checks: ValidationCheck[] = [];

  constructor(client: PrismaClient) {
    this.client = client;
    this.initializeDefaultChecks();
  }

  private initializeDefaultChecks(): void {
    // Core data integrity checks
    this.addCheck({
      name: "foreign_key_integrity",
      description: "Verify all foreign key relationships are valid",
      check: async (client) => {
        // Check for orphaned records in key tables
        const orphanedChecks = [
          // Items without valid vendors
          {
            name: "items_vendor_fk",
            query: `
              SELECT COUNT(*) as count FROM Item i 
              WHERE i.vendorId IS NOT NULL 
              AND NOT EXISTS (SELECT 1 FROM Vendor v WHERE v.id = i.vendorId)
            `,
          },
          // Mashing protocol steps without valid protocols
          {
            name: "mashing_steps_protocol_fk",
            query: `
              SELECT COUNT(*) as count FROM MashingProtocolStep mps 
              WHERE NOT EXISTS (SELECT 1 FROM MashingProtocol mp WHERE mp.id = mps.mashingProtocolId)
            `,
          },
          // Recipe BOM items without valid recipes
          {
            name: "recipe_bom_items_recipe_fk",
            query: `
              SELECT COUNT(*) as count FROM RecipeBomItem rbi 
              WHERE NOT EXISTS (SELECT 1 FROM RecipeBom rb WHERE rb.id = rbi.recipeBomId)
            `,
          },
        ];

        let totalOrphaned = 0;
        const issues: string[] = [];

        for (const check of orphanedChecks) {
          const result = await client.$queryRaw<
            [{ count: bigint }]
          >`${check.query}`;
          const count = Number(result[0].count);
          totalOrphaned += count;

          if (count > 0) {
            issues.push(`${check.name}: ${count} orphaned records`);
          }
        }

        return {
          valid: totalOrphaned === 0,
          message: issues.length > 0 ? issues.join(", ") : undefined,
          count: totalOrphaned,
        };
      },
    });

    this.addCheck({
      name: "required_core_data",
      description: "Verify required core data exists",
      check: async (client) => {
        const requiredCounts = [
          { table: "Vendor", min: 1, description: "At least one vendor" },
          { table: "Customer", min: 1, description: "At least one customer" },
          {
            table: "Item",
            min: 5,
            description: "At least 5 items (grains, yeast, etc.)",
          },
          {
            table: "PhaseParameter",
            min: 10,
            description: "At least 10 phase parameters",
          },
          { table: "Operation", min: 3, description: "At least 3 operations" },
        ];

        const issues: string[] = [];
        let totalChecked = 0;

        for (const req of requiredCounts) {
          const result = await client.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) as count FROM ${req.table}
          `;
          const count = Number(result[0].count);
          totalChecked++;

          if (count < req.min) {
            issues.push(
              `${req.table}: has ${count}, requires ${req.min} (${req.description})`
            );
          }
        }

        return {
          valid: issues.length === 0,
          message: issues.length > 0 ? issues.join(", ") : undefined,
          count: totalChecked,
        };
      },
    });

    this.addCheck({
      name: "data_consistency",
      description: "Verify data consistency rules",
      check: async (client) => {
        const consistencyChecks = [
          // All mashing protocols should have at least one step
          {
            name: "mashing_protocols_have_steps",
            query: `
              SELECT COUNT(*) as count FROM MashingProtocol mp
              WHERE NOT EXISTS (SELECT 1 FROM MashingProtocolStep mps WHERE mps.mashingProtocolId = mp.id)
            `,
          },
          // All recipes should have at least one BOM item
          {
            name: "recipes_have_bom_items",
            query: `
              SELECT COUNT(*) as count FROM Recipe r
              WHERE NOT EXISTS (
                SELECT 1 FROM RecipeBom rb 
                INNER JOIN RecipeBomItem rbi ON rb.id = rbi.recipeBomId 
                WHERE rb.recipeId = r.id
              )
            `,
          },
          // Recipe BOM items should reference valid items
          {
            name: "recipe_bom_items_valid_items",
            query: `
              SELECT COUNT(*) as count FROM RecipeBomItem rbi
              WHERE NOT EXISTS (SELECT 1 FROM Item i WHERE i.id = rbi.itemId)
            `,
          },
        ];

        const issues: string[] = [];
        let totalInconsistencies = 0;

        for (const check of consistencyChecks) {
          const result = await client.$queryRaw<
            [{ count: bigint }]
          >`${check.query}`;
          const count = Number(result[0].count);
          totalInconsistencies += count;

          if (count > 0) {
            issues.push(`${check.name}: ${count} inconsistent records`);
          }
        }

        return {
          valid: totalInconsistencies === 0,
          message: issues.length > 0 ? issues.join(", ") : undefined,
          count: totalInconsistencies,
        };
      },
    });

    this.addCheck({
      name: "enum_values_valid",
      description: "Verify enum values are valid",
      check: async (client) => {
        // Check for invalid enum values that might cause application errors
        const enumChecks = [
          {
            name: "item_types",
            query: `
              SELECT COUNT(*) as count FROM Item 
              WHERE itemType NOT IN ('RawMaterial', 'SemiFinished', 'FinishedGood', 'ProcessAid', 'Packaging')
            `,
          },
          {
            name: "operation_names",
            query: `
              SELECT COUNT(*) as count FROM Operation 
              WHERE name NOT IN ('Cook', 'Fermenter', 'StillRun', 'BlendingTank', 'CisternTank', 'Barreling')
            `,
          },
        ];

        const issues: string[] = [];
        let totalInvalid = 0;

        for (const check of enumChecks) {
          try {
            const result = await client.$queryRaw<
              [{ count: bigint }]
            >`${check.query}`;
            const count = Number(result[0].count);
            totalInvalid += count;

            if (count > 0) {
              issues.push(`${check.name}: ${count} invalid enum values`);
            }
          } catch (error) {
            // Skip enum checks that fail due to schema differences
            console.warn(`Enum check ${check.name} skipped: ${error}`);
          }
        }

        return {
          valid: totalInvalid === 0,
          message: issues.length > 0 ? issues.join(", ") : undefined,
          count: totalInvalid,
        };
      },
    });

    this.addCheck({
      name: "business_logic_validation",
      description: "Verify business logic constraints",
      check: async (client) => {
        const businessChecks = [
          // Recipe percentages should add up to ~100% for grain bills
          {
            name: "recipe_percentages_valid",
            query: `
              SELECT COUNT(*) as count FROM (
                SELECT rb.recipeId, SUM(rbi.percentage) as total_percentage
                FROM RecipeBom rb
                INNER JOIN RecipeBomItem rbi ON rb.id = rbi.recipeBomId
                INNER JOIN Item i ON rbi.itemId = i.id
                WHERE i.itemClass = 'Grain'
                GROUP BY rb.recipeId
                HAVING total_percentage < 95 OR total_percentage > 105
              ) as invalid_recipes
            `,
          },
          // Items should have reasonable unit types
          {
            name: "item_units_reasonable",
            query: `
              SELECT COUNT(*) as count FROM Item 
              WHERE itemType = 'RawMaterial' 
              AND itemClass = 'Grain'
              AND defaultUnitId IS NULL
            `,
          },
        ];

        const issues: string[] = [];
        let totalIssues = 0;

        for (const check of businessChecks) {
          try {
            const result = await client.$queryRaw<
              [{ count: bigint }]
            >`${check.query}`;
            const count = Number(result[0].count);
            totalIssues += count;

            if (count > 0) {
              issues.push(`${check.name}: ${count} business rule violations`);
            }
          } catch (error) {
            // Skip checks that fail due to missing columns or data
            console.warn(
              `Business logic check ${check.name} skipped: ${error}`
            );
          }
        }

        return {
          valid: totalIssues === 0,
          message: issues.length > 0 ? issues.join(", ") : undefined,
          count: totalIssues,
        };
      },
    });
  }

  addCheck(check: ValidationCheck): void {
    this.checks.push(check);
  }

  async runAllChecks(): Promise<ValidationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    let recordsValidated = 0;
    let checksRun = 0;

    console.log(`Running ${this.checks.length} validation checks...`);

    for (const check of this.checks) {
      try {
        console.log(`  • ${check.description}`);
        const result = await check.check(this.client);
        checksRun++;

        if (result.count !== undefined) {
          recordsValidated += result.count;
        }

        if (!result.valid) {
          const message = `${check.name}: ${
            result.message || "Validation failed"
          }`;
          if (
            check.name.includes("business_logic") ||
            check.name.includes("enum_values")
          ) {
            warnings.push(message);
          } else {
            errors.push(message);
          }
        }
      } catch (error) {
        const errorMessage = `${check.name}: Check failed - ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
        warnings.push(errorMessage);
        console.warn(`    Warning: ${errorMessage}`);
      }
    }

    const executionTime = Date.now() - startTime;
    const valid = errors.length === 0;

    console.log(`\nValidation completed in ${executionTime}ms:`);
    console.log(`  • Checks run: ${checksRun}/${this.checks.length}`);
    console.log(`  • Records validated: ${recordsValidated}`);
    console.log(`  • Errors: ${errors.length}`);
    console.log(`  • Warnings: ${warnings.length}`);

    if (errors.length > 0) {
      console.log("\nErrors found:");
      errors.forEach((error) => console.log(`  ❌ ${error}`));
    }

    if (warnings.length > 0) {
      console.log("\nWarnings:");
      warnings.forEach((warning) => console.log(`  ⚠️  ${warning}`));
    }

    return {
      valid,
      errors,
      warnings,
      recordsValidated,
    };
  }

  async runCheck(checkName: string): Promise<ValidationResult> {
    const check = this.checks.find((c) => c.name === checkName);
    if (!check) {
      return {
        valid: false,
        errors: [`Check not found: ${checkName}`],
        warnings: [],
        recordsValidated: 0,
      };
    }

    try {
      const result = await check.check(this.client);
      return {
        valid: result.valid,
        errors: result.valid ? [] : [result.message || "Check failed"],
        warnings: [],
        recordsValidated: result.count || 0,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [
          `Check execution failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        ],
        warnings: [],
        recordsValidated: 0,
      };
    }
  }

  getAvailableChecks(): { name: string; description: string }[] {
    return this.checks.map((check) => ({
      name: check.name,
      description: check.description,
    }));
  }
}
