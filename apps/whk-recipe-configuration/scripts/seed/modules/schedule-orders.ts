import { PrismaClient, EnumScheduleOrderStatus } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const scheduleOrdersModule: SeedModule = {
  name: "schedule-orders",
  description:
    "Schedule orders for production planning with FK links to recipes and customers",
  dependencies: ["recipes", "recipe-groups", "customers"],
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
      console.log("  └─ Seeding schedule orders...");

      // Check existing schedule orders
      const existingCount = await client.scheduleOrder.count();
      if (existingCount > 0 && config.skipExistingData) {
        console.log(
          `    Found ${existingCount} existing schedule orders, skipping`
        );
        return {
          success: true,
          message: `Skipped - ${existingCount} schedule orders already exist`,
          recordsCreated: 0,
          recordsUpdated: 0,
          errors: [],
          warnings: [],
          executionTimeMs: Date.now() - startTime,
        };
      }

      if (existingCount === 0) {
        // Get required FKs
        const customer = await client.customer.findFirst({
          where: { name: "WhiskeyHouse Internal" },
        });
        if (!customer) {
          errors.push("WhiskeyHouse Internal customer not found");
          throw new Error("Required customer not found");
        }

        const recipeGroups = await client.recipeGroup.findMany();
        if (recipeGroups.length === 0) {
          errors.push("No recipe groups found");
          throw new Error("Required recipe groups not found");
        }

        const recipes = await client.recipe.findMany({
          where: { isClassDefinition: true },
        });
        if (recipes.length === 0) {
          errors.push("No master recipes found");
          throw new Error("Required master recipes not found");
        }

        // Create schedule order queues first
        const scheduleQueues = [
          {
            queueIndex: 1,
            createdBy: "system",
          },
          {
            queueIndex: 2,
            createdBy: "system",
          },
          {
            queueIndex: 3,
            createdBy: "system",
          },
        ];

        const createdQueues = [];
        for (const queue of scheduleQueues) {
          const created = await client.scheduleOrderQueue.create({
            data: queue,
          });
          createdQueues.push(created);
          recordsCreated++;
        }
        console.log(
          `    Created ${scheduleQueues.length} schedule order queues`
        );

        // Create schedule orders
        const bourbonGroup = recipeGroups.find(
          (g) => g.recipe === "Bourbon-Standard"
        );
        const premiumGroup = recipeGroups.find(
          (g) => g.recipe === "Bourbon-Premium"
        );
        const ryeGroup = recipeGroups.find(
          (g) => g.recipe === "RyeWhiskey-Classic"
        );

        const bourbonRecipe = recipes.find((r) =>
          r.Recipe?.includes("Bourbon-Standard")
        );
        const premiumRecipe = recipes.find((r) =>
          r.Recipe?.includes("Bourbon-Premium")
        );
        const ryeRecipe = recipes.find((r) =>
          r.Recipe?.includes("Rye-Classic")
        );

        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + 7);

        const scheduleOrders = [
          {
            name: "Schedule-Bourbon-Standard-Week-001",
            recipeName: "Master-Bourbon-Standard-Recipe-001",
            recipeGroupId: bourbonGroup?.id || "",
            scheduleOrderRecipeId: bourbonRecipe?.id,
            status: EnumScheduleOrderStatus.Created,
            estimatedStart: tomorrow,
            estimatedEnd: new Date(
              tomorrow.getTime() + 5 * 24 * 60 * 60 * 1000
            ), // 5 days later
            estimatedMashingStartTime: tomorrow,
            estimatedMashingDuration: 8.0,
            estimatedFermentationStartTime: new Date(
              tomorrow.getTime() + 24 * 60 * 60 * 1000
            ), // 1 day later
            estimatedFermentationDuration: 72.0,
            estimatedDistillationStartTime: new Date(
              tomorrow.getTime() + 4 * 24 * 60 * 60 * 1000
            ), // 4 days later
            estimatedDistillationDuration: 12.0,
            duration: 120.0,
            durationUnits: "Hours",
            productionOrderAllocation: {},
            scheduleOrderQueueId: createdQueues[0]?.id,
            createdBy: "system",
          },
          {
            name: "Schedule-Bourbon-Premium-Week-001",
            recipeName: "Master-Bourbon-Premium-Recipe-001",
            recipeGroupId: premiumGroup?.id || "",
            scheduleOrderRecipeId: premiumRecipe?.id,
            status: EnumScheduleOrderStatus.Scheduled,
            estimatedStart: nextWeek,
            estimatedEnd: new Date(
              nextWeek.getTime() + 6 * 24 * 60 * 60 * 1000
            ), // 6 days later
            estimatedMashingStartTime: nextWeek,
            estimatedMashingDuration: 10.0,
            estimatedFermentationStartTime: new Date(
              nextWeek.getTime() + 24 * 60 * 60 * 1000
            ), // 1 day later
            estimatedFermentationDuration: 96.0,
            estimatedDistillationStartTime: new Date(
              nextWeek.getTime() + 5 * 24 * 60 * 60 * 1000
            ), // 5 days later
            estimatedDistillationDuration: 14.0,
            duration: 144.0,
            durationUnits: "Hours",
            productionOrderAllocation: {},
            scheduleOrderQueueId: createdQueues[1]?.id,
            createdBy: "system",
          },
          {
            name: "Schedule-Rye-Classic-Week-002",
            recipeName: "Master-Rye-Classic-Recipe-001",
            recipeGroupId: ryeGroup?.id || "",
            scheduleOrderRecipeId: ryeRecipe?.id,
            status: EnumScheduleOrderStatus.Created,
            estimatedStart: new Date(
              nextWeek.getTime() + 7 * 24 * 60 * 60 * 1000
            ), // 2 weeks from now
            estimatedEnd: new Date(
              nextWeek.getTime() + 12 * 24 * 60 * 60 * 1000
            ), // 5 days duration
            estimatedMashingStartTime: new Date(
              nextWeek.getTime() + 7 * 24 * 60 * 60 * 1000
            ),
            estimatedMashingDuration: 9.0,
            estimatedFermentationStartTime: new Date(
              nextWeek.getTime() + 8 * 24 * 60 * 60 * 1000
            ),
            estimatedFermentationDuration: 84.0,
            estimatedDistillationStartTime: new Date(
              nextWeek.getTime() + 11 * 24 * 60 * 60 * 1000
            ),
            estimatedDistillationDuration: 13.0,
            duration: 120.0,
            durationUnits: "Hours",
            productionOrderAllocation: {},
            scheduleOrderQueueId: createdQueues[2]?.id,
            createdBy: "system",
          },
        ];

        for (const scheduleOrder of scheduleOrders) {
          await client.scheduleOrder.create({ data: scheduleOrder });
          recordsCreated++;
        }
        console.log(
          `    Created ${scheduleOrders.length} schedule orders with FK links`
        );

        // Link customers to schedule orders
        const scheduleOrdersCreated = await client.scheduleOrder.findMany({
          where: {
            name: { in: scheduleOrders.map((so) => so.name) },
          },
        });

        for (const scheduleOrder of scheduleOrdersCreated) {
          await client.scheduleOrder.update({
            where: { id: scheduleOrder.id },
            data: {
              customers: {
                connect: { id: customer.id },
              },
            },
          });
        }
        console.log(
          `    Linked ${scheduleOrdersCreated.length} schedule orders to customer`
        );
      } else {
        console.log(
          `    Skipped creating schedule orders - ${existingCount} already exist`
        );
      }

      return {
        success: true,
        message:
          recordsCreated > 0
            ? `Successfully created ${recordsCreated} schedule orders and queues with FK hierarchy`
            : "Skipped - schedule orders already exist",
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
          : "Unknown error in schedule orders seeding";
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
      // Validate schedule orders exist
      const ordersCount = await client.scheduleOrder.count();
      recordsValidated += ordersCount;

      if (ordersCount < 3) {
        errors.push(
          `Insufficient schedule orders: ${ordersCount} (expected at least 3)`
        );
      }

      // Validate schedule order queues exist
      const queuesCount = await client.scheduleOrderQueue.count();
      recordsValidated += queuesCount;

      if (queuesCount < 3) {
        errors.push(
          `Insufficient schedule order queues: ${queuesCount} (expected at least 3)`
        );
      }

      // Validate FK links (check for actual values)
      const ordersWithFKs = await client.scheduleOrder.findMany({
        select: {
          recipeGroupId: true,
          scheduleOrderRecipeId: true,
          scheduleOrderQueueId: true,
        },
      });

      const ordersWithRecipeGroup = ordersWithFKs.filter(
        (o) => o.recipeGroupId !== null
      ).length;
      if (ordersWithRecipeGroup < ordersCount * 0.8) {
        errors.push(
          `${
            ordersCount - ordersWithRecipeGroup
          } schedule orders missing recipe group FK`
        );
      }

      const ordersWithRecipe = ordersWithFKs.filter(
        (o) => o.scheduleOrderRecipeId !== null
      ).length;
      if (ordersWithRecipe < ordersCount * 0.8) {
        warnings.push(
          `${ordersCount - ordersWithRecipe} schedule orders missing recipe FK`
        );
      }

      const ordersWithQueue = ordersWithFKs.filter(
        (o) => o.scheduleOrderQueueId !== null
      ).length;
      if (ordersWithQueue < ordersCount * 0.8) {
        warnings.push(
          `${ordersCount - ordersWithQueue} schedule orders missing queue FK`
        );
      }

      // Validate business logic - schedule orders should have realistic durations
      const ordersWithDuration = await client.scheduleOrder.findMany({
        select: {
          duration: true,
          estimatedMashingDuration: true,
          estimatedFermentationDuration: true,
          estimatedDistillationDuration: true,
        },
      });

      for (const order of ordersWithDuration) {
        const totalEstimated =
          (order.estimatedMashingDuration || 0) +
          (order.estimatedFermentationDuration || 0) +
          (order.estimatedDistillationDuration || 0);

        if (order.duration && totalEstimated > order.duration * 1.2) {
          warnings.push(
            `Schedule order has estimated durations exceeding total duration by >20%`
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
