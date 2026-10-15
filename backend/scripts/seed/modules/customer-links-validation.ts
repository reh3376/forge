import { PrismaClient } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const customerLinksValidationModule: SeedModule = {
  name: "customer-links-validation",
  description: "Validate and fix missing customer links across all entities",
  dependencies: ["customers", "recipes", "schedule-orders"],
  priority: SEED_PRIORITIES.RECIPES + 1, // Run after recipes
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
      console.log("  └─ Validating and fixing customer links...");

      // Get the main customer - try WhiskeyHouse Internal first, fall back to KWH Venture
      let customer = await client.customer.findFirst({
        where: { name: "WhiskeyHouse Internal" },
      });

      if (!customer) {
        // Fall back to KWH Venture, LLC (customerCode: WHK)
        customer = await client.customer.findFirst({
          where: { customerCode: "WHK" },
        });

        if (customer) {
          warnings.push(
            `Using "${customer.name}" (${customer.customerCode}) as default customer instead of "WhiskeyHouse Internal"`
          );
        }
      }

      if (!customer) {
        // Last resort: use any customer
        customer = await client.customer.findFirst();
        if (customer) {
          warnings.push(
            `Using first available customer "${customer.name}" as default - consider creating "WhiskeyHouse Internal" customer`
          );
        } else {
          errors.push(
            "No customers found in database - run customers seed module first"
          );
          throw new Error("No customers available");
        }
      }

      // Check Recipe-Customer links using findMany approach
      const recipesWithoutCustomer = await client.recipe.findMany({
        select: { id: true, customerId: true },
      });

      const recipesToFix = recipesWithoutCustomer.filter(
        (r) => r.customerId === null
      );
      if (recipesToFix.length > 0) {
        warnings.push(
          `Found ${recipesToFix.length} recipes without customer links`
        );

        // Fix recipe customer links
        for (const recipe of recipesToFix) {
          await client.recipe.update({
            where: { id: recipe.id },
            data: { customerId: customer.id },
          });
          recordsUpdated++;
        }
        console.log(`    Fixed ${recipesToFix.length} recipe customer links`);
      }

      // Check ScheduleOrder-Customer many-to-many links
      // Use efficient query to find schedule orders without any customer links
      const scheduleOrdersWithoutCustomers =
        await client.scheduleOrder.findMany({
          where: {
            customers: {
              none: {},
            },
          },
          select: { id: true },
        });

      if (scheduleOrdersWithoutCustomers.length > 0) {
        warnings.push(
          `Found ${scheduleOrdersWithoutCustomers.length} schedule orders without customer links`
        );

        // Batch update using updateMany - more efficient than individual updates
        // Create junction table records directly
        await client.$executeRaw`
          INSERT INTO "_CustomerToScheduleOrder" ("A", "B")
          SELECT ${customer.id}::text, so.id
          FROM "ScheduleOrder" so
          LEFT JOIN "_CustomerToScheduleOrder" ctso ON ctso."B" = so.id AND ctso."A" = ${customer.id}::text
          WHERE ctso."A" IS NULL
          ON CONFLICT DO NOTHING
        `;

        recordsUpdated = scheduleOrdersWithoutCustomers.length;
        console.log(
          `    Fixed ${scheduleOrdersWithoutCustomers.length} schedule order customer links`
        );
      }

      // Additional validation: Check for orphaned entities that should have customer links
      // but might have been created without them in other modules

      // Future entities that might need customer links (for reference):
      const futureCustomerLinksNeeded = [
        "ProductionOrder", // Has required customerId
        "SalesOrder", // Has optional customerId
        "Batch", // Has optional customerId
        "InventoryLog", // Has customers array
      ];

      if (futureCustomerLinksNeeded.length > 0) {
        warnings.push(
          `Future entities may need customer links: ${futureCustomerLinksNeeded.join(
            ", "
          )}`
        );
      }

      const message =
        recordsUpdated > 0
          ? `Fixed ${recordsUpdated} missing customer links`
          : "All customer links are properly established";

      return {
        success: true,
        message,
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
          : "Unknown error in customer links validation";
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
      // Comprehensive customer relationship validation

      // 1. Validate Recipe-Customer relationships
      const allRecipes = await client.recipe.findMany({
        select: { id: true, customerId: true },
      });
      recordsValidated += allRecipes.length;

      const recipesWithCustomer = allRecipes.filter(
        (r) => r.customerId !== null
      ).length;
      if (recipesWithCustomer < allRecipes.length) {
        errors.push(
          `${
            allRecipes.length - recipesWithCustomer
          } recipes missing customer links`
        );
      }

      // 2. Validate ScheduleOrder-Customer relationships (many-to-many)
      const scheduleOrdersWithCustomers = await client.scheduleOrder.findMany({
        include: {
          customers: true,
          _count: { select: { customers: true } },
        },
      });
      recordsValidated += scheduleOrdersWithCustomers.length;

      const scheduleOrdersWithoutCustomers = scheduleOrdersWithCustomers.filter(
        (so) => so._count.customers === 0
      );

      if (scheduleOrdersWithoutCustomers.length > 0) {
        errors.push(
          `${scheduleOrdersWithoutCustomers.length} schedule orders missing customer links`
        );
      }

      // 3. Validate that a customer exists and is used
      let mainCustomer = await client.customer.findFirst({
        where: { name: "WhiskeyHouse Internal" },
      });

      if (!mainCustomer) {
        // Fall back to KWH Venture, LLC
        mainCustomer = await client.customer.findFirst({
          where: { customerCode: "WHK" },
        });
      }

      if (!mainCustomer) {
        // Use any customer
        mainCustomer = await client.customer.findFirst();
      }

      if (!mainCustomer) {
        errors.push("No customers found in database");
      } else {
        // Check if customer is being used across entities
        const customerUsage = await Promise.all([
          client.recipe.count({ where: { customerId: mainCustomer.id } }),
          client.scheduleOrder.count({
            where: {
              customers: {
                some: { id: mainCustomer.id },
              },
            },
          }),
        ]);

        const [recipesUsingCustomer, scheduleOrdersUsingCustomer] =
          customerUsage;

        if (recipesUsingCustomer === 0) {
          warnings.push("Main customer not linked to any recipes");
        }
        if (scheduleOrdersUsingCustomer === 0) {
          warnings.push("Main customer not linked to any schedule orders");
        }

        console.log(
          `      Customer usage: ${recipesUsingCustomer} recipes, ${scheduleOrdersUsingCustomer} schedule orders`
        );
      }

      // 4. Validate customer data quality
      const allCustomers = await client.customer.findMany();
      recordsValidated += allCustomers.length;

      const customersWithoutAddress = allCustomers.filter((c) => !c.address);
      if (customersWithoutAddress.length > 0) {
        warnings.push(
          `${customersWithoutAddress.length} customers missing address information`
        );
      }

      const customersWithoutCode = allCustomers.filter((c) => !c.customerCode);
      if (customersWithoutCode.length > 0) {
        warnings.push(
          `${customersWithoutCode.length} customers missing customer codes`
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
          `Customer links validation failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        ],
        warnings,
        recordsValidated,
      };
    }
  },
};
