import { PrismaClient } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const vendorsCustomersModule: SeedModule = {
  name: "vendors-customers",
  description: "Vendors and customers for business relationships",
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
      console.log("  └─ Seeding vendors...");

      const vendorsData = [
        {
          id: "vendor-grain-supply-001",
          name: "Prairie Grain Cooperative",
          erpId: "VEND-001",
          active: true,
          createdBy: "system-migration",
          updatedBy: "system-migration",
          updatedAt: new Date(),
        },
        {
          id: "vendor-yeast-supply-001",
          name: "Lallemand Distilling",
          erpId: "VEND-002",
          active: true,
          createdBy: "system-migration",
          updatedBy: "system-migration",
          updatedAt: new Date(),
        },
        {
          id: "vendor-enzyme-supply-001",
          name: "Novozymes Biologicals",
          erpId: "VEND-003",
          active: true,
          createdBy: "system-migration",
          updatedBy: "system-migration",
          updatedAt: new Date(),
        },
        {
          id: "vendor-barrel-supply-001",
          name: "Independent Stave Company",
          erpId: "VEND-004",
          active: true,
          createdBy: "system-migration",
          updatedBy: "system-migration",
          updatedAt: new Date(),
        },
      ];

      const vendorResult = await client.vendor.createMany({
        data: vendorsData,
        skipDuplicates: true,
      });
      recordsCreated += vendorResult.count;

      console.log("  └─ Seeding customers...");

      const customersData = [
        {
          id: "customer-house-brand-001",
          name: "House Brand Whiskey",
          address: "123 Distillery Row, Louisville, KY 40202",
          customerCode: "CUST-001",
          createdBy: "system-migration",
          revision: 0,
          updatedAt: new Date(),
        },
        {
          id: "customer-private-label-001",
          name: "Premium Private Label Co",
          address: "456 Bourbon Street, Bardstown, KY 40004",
          customerCode: "CUST-002",
          createdBy: "system-migration",
          revision: 0,
          updatedAt: new Date(),
        },
      ];

      const customerResult = await client.customer.createMany({
        data: customersData,
        skipDuplicates: true,
      });
      recordsCreated += customerResult.count;

      return {
        success: true,
        message: "Vendors and customers seeded successfully",
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
          : "Unknown error in vendors/customers seeding";
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
      // Validate vendors exist
      const vendorsCount = await client.vendor.count();
      recordsValidated += vendorsCount;
      if (vendorsCount < 3) {
        errors.push(
          `Insufficient vendors: ${vendorsCount} (expected at least 3)`
        );
      }

      // Validate customers exist
      const customersCount = await client.customer.count();
      recordsValidated += customersCount;
      if (customersCount < 1) {
        errors.push(
          `No customers found: ${customersCount} (expected at least 1)`
        );
      }

      // Validate required vendors exist
      const requiredVendors = [
        "Prairie Grain Cooperative",
        "Lallemand Distilling",
        "Novozymes Biologicals",
      ];

      for (const vendorName of requiredVendors) {
        const vendor = await client.vendor.findFirst({
          where: { name: vendorName },
        });
        if (!vendor) {
          errors.push(`Required vendor not found: ${vendorName}`);
        }
      }

      // Validate vendor ERP IDs are unique
      const vendorErpIds = await client.vendor.groupBy({
        by: ["erpId"],
        _count: { erpId: true },
        having: { erpId: { _count: { gt: 1 } } },
      });

      if (vendorErpIds.length > 0) {
        errors.push(
          `Duplicate vendor ERP IDs found: ${vendorErpIds
            .map((v) => v.erpId)
            .join(", ")}`
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
