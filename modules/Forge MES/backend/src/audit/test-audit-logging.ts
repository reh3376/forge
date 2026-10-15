import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { ClsService } from "nestjs-cls";
import { AuditMiddlewareService } from "./audit-middleware.service";

/**
 * Test script to verify audit logging is working
 * This script simulates a recipe update and checks if audit logs are created
 */
async function testAuditLogging() {
  console.log("🔍 Testing audit logging for recipe updates...");

  // Create NestJS application context
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    // Get services from the application context
    const prisma = app.get(PrismaService);
    const cls = app.get(ClsService);
    const auditMiddleware = app.get(AuditMiddlewareService);

    // First, let's check if we have any recipes to test with
    const existingRecipe = await prisma.recipe.findFirst({
      where: { active: true },
    });

    if (!existingRecipe) {
      console.log("❌ No active recipes found to test with");
      return;
    }

    console.log(
      `📝 Found recipe to test: ${existingRecipe.Recipe} (ID: ${existingRecipe.id})`
    );

    // Create or find a test user
    let testUser = await prisma.user.findFirst({
      where: { username: "audit-test-user" },
    });

    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          username: "audit-test-user",
          firstName: "Audit",
          lastName: "Test",
          password: "test-password",
          roles: ["test"],
        },
      });
      console.log(
        `📝 Created test user: ${testUser.username} (ID: ${testUser.id})`
      );
    } else {
      console.log(
        `📝 Using existing test user: ${testUser.username} (ID: ${testUser.id})`
      );
    }

    // Check audit logs before update
    const auditLogsBefore = await prisma.auditLog.count();
    console.log(`📊 Audit logs before update: ${auditLogsBefore}`);

    // Use the withSystemContext method to properly set up audit context
    console.log("🔧 Performing recipe update with audit context...");

    const result = await auditMiddleware.withSystemContext(
      "test-audit-logging",
      async () => {
        // Set the specific user context for this operation
        auditMiddleware.setAuditContext({
          userId: testUser.id,
          ipAddress: "127.0.0.1",
          userAgent: "audit-test-script",
        });

        console.log("🔍 About to perform Recipe.update operation...");
        console.log(`   - Recipe ID: ${existingRecipe.id}`);
        console.log(`   - User ID: ${testUser.id}`);

        // Perform a simple update that should trigger the audit middleware
        const updatedRecipe = await prisma.recipe.update({
          where: { id: existingRecipe.id },
          data: {
            updatedBy: testUser.id,
            updatedAt: new Date(),
            // Add a small change to ensure the update actually happens
            schemaVersion: `audit-test-${Date.now()}`,
          },
        });

        console.log("✅ Recipe.update operation completed");
        console.log(`   - Updated recipe ID: ${updatedRecipe.id}`);
        console.log(
          `   - Updated schemaVersion: ${updatedRecipe.schemaVersion}`
        );

        return updatedRecipe;
      }
    );

    console.log("✅ Recipe updated successfully");

    // Check audit logs after update
    const auditLogsAfter = await prisma.auditLog.count();
    console.log(`📊 Audit logs after update: ${auditLogsAfter}`);

    if (auditLogsAfter > auditLogsBefore) {
      console.log("✅ SUCCESS: New audit logs were created!");

      // Get the latest audit log
      const latestAuditLog = await prisma.auditLog.findFirst({
        orderBy: { createdAt: "desc" },
      });

      if (latestAuditLog) {
        console.log("📋 Latest audit log:");
        console.log(`   - Entity Type: ${latestAuditLog.entityType}`);
        console.log(`   - Entity ID: ${latestAuditLog.entityId}`);
        console.log(`   - Action: ${latestAuditLog.action}`);
        console.log(`   - User ID: ${latestAuditLog.userId}`);
        console.log(`   - Created At: ${latestAuditLog.createdAt}`);
      }
    } else {
      console.log(
        "❌ FAILURE: No new audit logs were created. Audit logging may not be working."
      );
    }

    // Show total audit logs in system
    const totalAuditLogs = await prisma.auditLog.count();
    console.log(`📊 Total audit logs in system: ${totalAuditLogs}`);

    if (totalAuditLogs === 0) {
      console.log(
        "⚠️  No audit logs found in the system. This suggests the audit middleware is not working."
      );
    }
  } catch (error) {
    console.error("❌ Error during audit logging test:", error);
  } finally {
    await app.close();
    console.log("🏁 Audit logging test completed");
  }
}

// Run the test
testAuditLogging().catch(console.error);
