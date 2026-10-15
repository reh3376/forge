import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { AuditMiddlewareService } from "./audit-middleware.service";
import { ClsService } from "nestjs-cls";

async function testSimpleAudit() {
  console.log("🔍 Testing simple audit logging...");

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const prisma = app.get(PrismaService);
    const auditMiddleware = app.get(AuditMiddlewareService);
    const cls = app.get(ClsService);

    // Find a recipe to test with
    const recipe = await prisma.recipe.findFirst({
      where: { active: true },
    });

    if (!recipe) {
      console.log("❌ No active recipes found");
      return;
    }

    console.log(`📝 Found recipe: ${recipe.Recipe} (ID: ${recipe.id})`);

    // Find or create test user
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
    }

    console.log(
      `📝 Using test user: ${testUser.username} (ID: ${testUser.id})`
    );

    // Run the audit operation within a CLS context
    await cls.run(async () => {
      console.log("🔧 Setting audit context within CLS...");

      // Set audit context directly
      auditMiddleware.setAuditContext({
        userId: testUser.id,
        ipAddress: "127.0.0.1",
        userAgent: "simple-audit-test",
      });

      console.log("🔧 Performing Recipe.update...");

      // Perform the update
      const updatedRecipe = await prisma.recipe.update({
        where: { id: recipe.id },
        data: {
          schemaVersion: `simple-test-${Date.now()}`,
        },
      });

      console.log("✅ Recipe.update completed");
      console.log(`   - Updated schemaVersion: ${updatedRecipe.schemaVersion}`);
    });

    // Check for audit logs
    const auditLogs = await prisma.auditLog.count();
    console.log(`📊 Total audit logs: ${auditLogs}`);

    if (auditLogs > 0) {
      console.log("✅ SUCCESS: Audit logs were created!");

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
      }
    } else {
      console.log("❌ FAILURE: No audit logs were created");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await app.close();
    console.log("🏁 Test completed");
  }
}

testSimpleAudit().catch(console.error);
