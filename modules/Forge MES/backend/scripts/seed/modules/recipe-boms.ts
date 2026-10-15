import { PrismaClient, EnumRecipeBomItemOperation } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const recipeBomsModule: SeedModule = {
  name: "recipe-boms",
  description:
    "Recipe BOMs and BOM items with FK links to recipes and items (auto-seeded with recipes)",
  dependencies: ["recipes", "basic-items"],
  priority: SEED_PRIORITIES.RECIPES,
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
      console.log("  └─ Seeding recipe BOMs...");

      // Check existing recipe BOMs
      const existingCount = await client.recipeBom.count();
      if (existingCount > 0 && config.skipExistingData) {
        console.log(
          `    Found ${existingCount} existing recipe BOMs, skipping`
        );
        return {
          success: true,
          message: `Skipped - ${existingCount} recipe BOMs already exist`,
          recordsCreated: 0,
          recordsUpdated: 0,
          errors: [],
          warnings: [],
          executionTimeMs: Date.now() - startTime,
        };
      }

      if (existingCount === 0 || !config.skipExistingData) {
        // Get required FKs
        const recipes = await client.recipe.findMany({
          where: { isClassDefinition: true },
        });
        if (recipes.length === 0) {
          errors.push("No master recipes found");
          throw new Error("Required master recipes not found");
        }

        const items = await client.item.findMany();
        if (items.length === 0) {
          errors.push("No items found");
          throw new Error("Required items not found");
        }

        // Find specific items for grain bills
        const cornItem = items.find(
          (i) =>
            i.itemName?.includes("Corn") || i.itemDescription?.includes("corn")
        );
        const wheatItem = items.find(
          (i) =>
            i.itemName?.includes("Wheat") ||
            i.itemDescription?.includes("wheat")
        );
        const ryeItem = items.find(
          (i) =>
            i.itemName?.includes("Rye") || i.itemDescription?.includes("rye")
        );
        const barleyItem = items.find(
          (i) =>
            i.itemName?.includes("Barley") ||
            i.itemDescription?.includes("malt")
        );

        // Create master recipe BOMs
        const masterBoms = [];
        for (const recipe of recipes) {
          const recipeBom = await client.recipeBom.create({
            data: {
              revision: "1.0",
              master: true,
              running: false,
            },
          });
          masterBoms.push({ recipeBom, recipe });
          recordsCreated++;

          // Link BOM to recipe
          await client.recipe.update({
            where: { id: recipe.id },
            data: {
              recipeBoms: {
                connect: { id: recipeBom.id },
              },
            },
          });
        }
        console.log(`    Created ${masterBoms.length} master recipe BOMs`);

        // Create BOM items for each recipe
        let bomItemsCreated = 0;
        for (const { recipeBom, recipe } of masterBoms) {
          let bomItems: Array<{
            itemId?: string;
            operation: EnumRecipeBomItemOperation;
            quantity: number;
          }> = [];

          // Bourbon Standard grain bill
          if (recipe.Recipe?.includes("Bourbon-Standard")) {
            bomItems = [
              {
                itemId: cornItem?.id,
                operation: EnumRecipeBomItemOperation.Mashing01,
                quantity: 70.0,
              },
              {
                itemId: wheatItem?.id,
                operation: EnumRecipeBomItemOperation.Mashing01,
                quantity: 16.0,
              },
              {
                itemId: barleyItem?.id,
                operation: EnumRecipeBomItemOperation.Mashing01,
                quantity: 14.0,
              },
            ];
          }
          // Bourbon Premium grain bill
          else if (recipe.Recipe?.includes("Bourbon-Premium")) {
            bomItems = [
              {
                itemId: cornItem?.id,
                operation: EnumRecipeBomItemOperation.Mashing01,
                quantity: 68.0,
              },
              {
                itemId: wheatItem?.id,
                operation: EnumRecipeBomItemOperation.Mashing01,
                quantity: 18.0,
              },
              {
                itemId: barleyItem?.id,
                operation: EnumRecipeBomItemOperation.Mashing01,
                quantity: 14.0,
              },
            ];
          }
          // Rye Classic grain bill
          else if (recipe.Recipe?.includes("Rye-Classic")) {
            bomItems = [
              {
                itemId: cornItem?.id,
                operation: EnumRecipeBomItemOperation.Mashing01,
                quantity: 51.0,
              },
              {
                itemId: ryeItem?.id,
                operation: EnumRecipeBomItemOperation.Mashing01,
                quantity: 35.0,
              },
              {
                itemId: barleyItem?.id,
                operation: EnumRecipeBomItemOperation.Mashing01,
                quantity: 14.0,
              },
            ];
          }
          // Wheated Bourbon grain bill
          else if (recipe.Recipe?.includes("Wheated-Bourbon")) {
            bomItems = [
              {
                itemId: cornItem?.id,
                operation: EnumRecipeBomItemOperation.Mashing01,
                quantity: 68.0,
              },
              {
                itemId: wheatItem?.id,
                operation: EnumRecipeBomItemOperation.Mashing01,
                quantity: 20.0,
              },
              {
                itemId: barleyItem?.id,
                operation: EnumRecipeBomItemOperation.Mashing01,
                quantity: 12.0,
              },
            ];
          }

          // Create BOM items
          for (const bomItemData of bomItems) {
            if (bomItemData.itemId) {
              await client.recipeBomItem.create({
                data: {
                  ...bomItemData,
                  recipeBomsId: recipeBom.id,
                  isClassDefinition: false,
                  createdBy: "system",
                },
              });
              bomItemsCreated++;
              recordsCreated++;
            }
          }
        }
        console.log(
          `    Created ${bomItemsCreated} recipe BOM items with item FK links`
        );

        // Create running instance BOMs from masters
        const runningBoms = [];
        for (const { recipeBom: masterBom, recipe } of masterBoms) {
          const runningBom = await client.recipeBom.create({
            data: {
              revision: "1.0",
              master: false,
              running: true,
              masterReceipeBomId: masterBom.id,
            },
          });
          runningBoms.push(runningBom);
          recordsCreated++;
        }
        console.log(
          `    Created ${runningBoms.length} running BOM instances with master FK links`
        );
      } else {
        console.log(
          `    Skipped creating recipe BOMs - ${existingCount} already exist`
        );
      }

      return {
        success: true,
        message:
          recordsCreated > 0
            ? `Successfully created ${recordsCreated} recipe BOMs and items with FK hierarchy`
            : "Skipped - recipe BOMs already exist",
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
          : "Unknown error in recipe BOMs seeding";
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
      // Validate recipe BOMs exist
      const bomsCount = await client.recipeBom.count();
      recordsValidated += bomsCount;

      if (bomsCount < 4) {
        errors.push(
          `Insufficient recipe BOMs: ${bomsCount} (expected at least 4)`
        );
      }

      // Check master BOMs exist
      const masterBomsCount = await client.recipeBom.count({
        where: { master: true },
      });
      if (masterBomsCount < 2) {
        errors.push(
          `Insufficient master BOMs: ${masterBomsCount} (expected at least 2)`
        );
      }

      // Check running instances linked to masters
      const runningBomsCount = await client.recipeBom.count({
        where: {
          running: true,
          masterReceipeBomId: { not: null },
        },
      });
      if (runningBomsCount < 2) {
        warnings.push(
          `Few running BOM instances linked to masters: ${runningBomsCount}`
        );
      }

      // Validate BOM items exist
      const bomItemsCount = await client.recipeBomItem.count();
      recordsValidated += bomItemsCount;

      if (bomItemsCount < 8) {
        errors.push(
          `Insufficient BOM items: ${bomItemsCount} (expected at least 8)`
        );
      }

      // Validate BOM items have item FK links
      const itemsWithFKCount = await client.recipeBomItem.count({
        where: { itemId: { not: null } },
      });
      if (itemsWithFKCount < bomItemsCount * 0.8) {
        errors.push(
          `${bomItemsCount - itemsWithFKCount} BOM items missing item FK`
        );
      }

      // Validate BOM items have recipe BOM FK links
      const bomItemsWithRecipeBomCount = await client.recipeBomItem.count({
        where: { recipeBomsId: { not: null } },
      });
      if (bomItemsWithRecipeBomCount < bomItemsCount * 0.8) {
        errors.push(
          `${
            bomItemsCount - bomItemsWithRecipeBomCount
          } BOM items missing recipe BOM FK`
        );
      }

      // Validate grain bill totals (business rule)
      const recipeBoms = await client.recipeBom.findMany({
        where: { master: true },
        include: {
          recipeBomITem: {
            include: {
              item: true,
            },
          },
        },
      });

      for (const bom of recipeBoms) {
        const totalQuantity = bom.recipeBomITem.reduce(
          (sum: number, item: any) => sum + (item.quantity || 0),
          0
        );
        // Grain bills should total around 100% (allow some tolerance)
        if (totalQuantity < 95 || totalQuantity > 105) {
          warnings.push(
            `Recipe BOM ${bom.id} has unusual grain bill total: ${totalQuantity}%`
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
