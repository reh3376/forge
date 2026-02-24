import { PrismaClient } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";
import * as bcrypt from "bcrypt";

export const usersModule: SeedModule = {
  name: "users",
  description:
    "System users including MES service account from .env credentials",
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
      console.log("  └─ Seeding system users...");

      // Check existing users
      const existingCount = await client.user.count();
      if (existingCount > 0 && config.skipExistingData) {
        console.log(`    Found ${existingCount} existing users, skipping`);
        return {
          success: true,
          message: `Skipped - ${existingCount} users already exist`,
          recordsCreated: 0,
          recordsUpdated: 0,
          errors: [],
          warnings: [],
          executionTimeMs: Date.now() - startTime,
        };
      }

      if (existingCount === 0 || !config.skipExistingData) {
        // Get MES credentials from environment
        const mesUsername = process.env.MES_USER;
        const mesPassword = process.env.MES_PASSWORD;
        const saltRounds = parseInt(process.env.BCRYPT_SALT || "10");

        if (!mesUsername || !mesPassword) {
          errors.push(
            "MES_USER or MES_PASSWORD not found in environment variables"
          );
          throw new Error("Required MES credentials not found in .env");
        }

        console.log(`    Creating MES service account: ${mesUsername}`);

        // Hash the password
        const hashedPassword = await bcrypt.hash(mesPassword, saltRounds);

        // Create MES service account user
        const mesUser = await client.user.create({
          data: {
            username: mesUsername,
            password: hashedPassword,
            firstName: "MES",
            lastName: "Service Account",
            roles: ["user"], // MES service account with user role
          },
        });

        recordsCreated++;
        console.log(`    Created MES service account with ID: ${mesUser.id}`);

        // Create additional system users if needed
        const adminUsers = [
          {
            username: "admin",
            password: "admin", // Default admin password
            firstName: "System",
            lastName: "Administrator",
            roles: ["user"],
          },
        ];

        for (const userData of adminUsers) {
          try {
            const hashedAdminPassword = await bcrypt.hash(
              userData.password,
              saltRounds
            );
            const adminUser = await client.user.create({
              data: {
                ...userData,
                password: hashedAdminPassword,
              },
            });
            recordsCreated++;
            console.log(`    Created admin user: ${adminUser.username}`);
          } catch (adminError) {
            // Skip if user already exists
            if (
              adminError instanceof Error &&
              adminError.message.includes("Unique constraint")
            ) {
              warnings.push(
                `Admin user ${userData.username} already exists, skipping`
              );
            } else {
              throw adminError;
            }
          }
        }

        console.log(`    Created ${recordsCreated} system users`);
      } else {
        console.log(
          `    Skipped creating users - ${existingCount} already exist`
        );
      }

      return {
        success: true,
        message:
          recordsCreated > 0
            ? `Successfully created ${recordsCreated} system users including MES service account`
            : "Skipped - users already exist",
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
          : "Unknown error in users seeding";
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
      // Validate users exist
      const usersCount = await client.user.count();
      recordsValidated += usersCount;

      if (usersCount < 1) {
        errors.push(`No users found (expected at least 1)`);
      }

      // Validate MES service account exists
      const mesUsername = process.env.MES_USER || "mes";
      const mesUser = await client.user.findUnique({
        where: { username: mesUsername },
      });

      if (!mesUser) {
        errors.push(`MES service account '${mesUsername}' not found`);
      } else {
        // Validate MES user has proper roles
        if (Array.isArray(mesUser.roles)) {
          if (!mesUser.roles.includes("user")) {
            warnings.push(`MES service account missing user role`);
          }
        } else {
          errors.push(`MES service account has invalid roles format`);
        }
      }

      // Check for users with user role (search in JSON array)
      const userRoleUsers = await client.user.findMany({
        where: {
          roles: {
            array_contains: ["user"],
          },
        },
      });
      const userRoleCount = userRoleUsers.length;

      if (userRoleCount < 1) {
        warnings.push(`No users with user role found`);
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
