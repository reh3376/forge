import { PrismaClient } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const customersModule: SeedModule = {
  name: "customers",
  description: "Customer accounts and contact information",
  dependencies: [],
  priority: SEED_PRIORITIES.VENDORS_CUSTOMERS,
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
      console.log("  └─ Seeding customers...");

      const customers = [
        {
          name: "WhiskeyHouse Internal",
          address: "123 Distillery Lane, Louisville, KY 40202",
          customerCode: "WHK-INT",
          description: "Internal operations and house brands",
          email: "operations@whiskeyhouse.com",
          phone: "(502) 555-0100",
          createdBy: "system",
        },
        {
          name: "Premium Spirits Distributors",
          address: "456 Commerce Street, Nashville, TN 37201",
          customerCode: "PSD-001",
          description: "Premium whiskey distributor for Southeast region",
          email: "orders@premiumspirits.com",
          phone: "(615) 555-0200",
          createdBy: "system",
        },
        {
          name: "Craft Bar Solutions",
          address: "789 Main Street, Chicago, IL 60601",
          customerCode: "CBS-001",
          description: "Craft cocktail bar supplier and consultant",
          email: "procurement@craftbarsolutions.com",
          phone: "(312) 555-0300",
          createdBy: "system",
        },
        {
          name: "Heritage Whiskey Co",
          address: "321 Oak Avenue, Frankfort, KY 40601",
          customerCode: "HWC-001",
          description: "Traditional whiskey brand partner",
          email: "distillery@heritagewhiskey.com",
          phone: "(502) 555-0400",
          createdBy: "system",
        },
        {
          name: "Mountain View Distillery",
          address: "654 Mountain Road, Gatlinburg, TN 37738",
          customerCode: "MVD-001",
          description: "Small batch whiskey producer",
          email: "info@mountainviewdistillery.com",
          phone: "(865) 555-0500",
          createdBy: "system",
        },
      ];

      // Check existing customers
      const existingCount = await client.customer.count();
      if (existingCount > 0 && config.skipExistingData) {
        console.log(`    Found ${existingCount} existing customers, skipping`);
        return {
          success: true,
          message: `Skipped - ${existingCount} customers already exist`,
          recordsCreated: 0,
          recordsUpdated: 0,
          errors: [],
          warnings: [],
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Create customers
      if (existingCount === 0) {
        await client.customer.createMany({
          data: customers,
        });
        recordsCreated = customers.length;
        console.log(`    Created ${recordsCreated} customers`);
      } else {
        console.log(
          `    Skipped creating customers - ${existingCount} already exist`
        );
      }

      return {
        success: true,
        message:
          recordsCreated > 0
            ? `Successfully created ${recordsCreated} customers`
            : "Skipped - customers already exist",
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
          : "Unknown error in customers seeding";
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
      // Validate customers exist
      const customersCount = await client.customer.count();
      recordsValidated += customersCount;

      if (customersCount < 3) {
        errors.push(
          `Insufficient customers: ${customersCount} (expected at least 3)`
        );
      }

      // Check for required internal customer
      const internalCustomer = await client.customer.findFirst({
        where: { customerCode: { contains: "WHK", mode: "insensitive" } },
      });
      if (!internalCustomer) {
        warnings.push("No internal WhiskeyHouse customer found");
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
