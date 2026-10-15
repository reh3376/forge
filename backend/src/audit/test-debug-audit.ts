import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { AuditMiddlewareService } from "./audit-middleware.service";
import { ClsService } from "nestjs-cls";

async function testDebugAudit() {
  console.log("🔍 Comprehensive audit debugging test...");

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const auditMiddleware = app.get(AuditMiddlewareService);
    const cls = app.get(ClsService);

    // Get the Prisma instance that has the middleware attached
    const prisma = (auditMiddleware as any).prisma;

    console.log("📊 Services obtained successfully");
    console.log(`   - Prisma: ${prisma.constructor.name}`);
    console.log(`   - AuditMiddleware: ${auditMiddleware.constructor.name}`);
    console.log(`   - CLS: ${cls.constructor.name}`);

    // Check if the Prisma instances are the same
    console.log("🔍 Checking Prisma instance details...");
    console.log(
      `   - Prisma instance ID: ${(prisma as any)._instanceId || "unknown"}`
    );
    console.log(
      `   - Prisma middleware count: ${
        (prisma as any)._middlewares?.length || "unknown"
      }`
    );

    // Check if the audit middleware service has the same Prisma instance
    const auditPrisma = (auditMiddleware as any).prisma;
    console.log(`   - Audit service Prisma: ${auditPrisma.constructor.name}`);
    console.log(
      `   - Same Prisma instance: ${
        prisma === auditPrisma ? "✅ YES" : "❌ NO"
      }`
    );
    console.log(
      `   - Audit Prisma middleware count: ${
        (auditPrisma as any)._middlewares?.length || "unknown"
      }`
    );

    // Find a recipe to test with
    console.log("🔍 Looking for a recipe to test with...");
    const recipe = await prisma.recipe.findFirst({
      where: { active: true },
    });

    if (!recipe) {
      console.log("❌ No active recipes found");
      return;
    }

    console.log(`📝 Found recipe: ${recipe.Recipe} (ID: ${recipe.id})`);

    // Find or create a test user
    console.log("🔍 Looking for test user...");
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

    // Test 1: Basic CLS functionality
    console.log("\n🧪 Test 1: Basic CLS functionality");
    await cls.run(async () => {
      cls.set("test-key", "test-value");
      const value = cls.get("test-key");
      console.log(
        `   - CLS set/get test: ${
          value === "test-value" ? "✅ PASS" : "❌ FAIL"
        }`
      );
    });

    // Test 2: Audit context functionality
    console.log("\n🧪 Test 2: Audit context set/get");
    await cls.run(async () => {
      auditMiddleware.setAuditContext({
        userId: testUser.id,
        ipAddress: "127.0.0.1",
        userAgent: "debug-test",
      });

      const context = (auditMiddleware as any).getAuditContext();
      console.log(
        `   - User ID: ${context.userId} (${
          context.userId === testUser.id ? "✅" : "❌"
        })`
      );
      console.log(
        `   - IP Address: ${context.ipAddress} (${
          context.ipAddress === "127.0.0.1" ? "✅" : "❌"
        })`
      );
      console.log(
        `   - User Agent: ${context.userAgent} (${
          context.userAgent === "debug-test" ? "✅" : "❌"
        })`
      );
    });

    // Test 3: Basic Prisma middleware test
    console.log("\n🧪 Test 3: Prisma middleware basic test");
    console.log("   - Performing a simple findFirst operation...");
    await prisma.recipe.findFirst();
    console.log(
      "   - findFirst completed (check logs above for middleware interception)"
    );

    // Test 4: Test Recipe.update with full debugging
    console.log("\n🧪 Test 4: Recipe.update with audit context");

    const auditLogsBefore = await prisma.auditLog.count();
    console.log(`   - Audit logs before: ${auditLogsBefore}`);

    await cls.run(async () => {
      console.log("   - Setting audit context...");
      auditMiddleware.setAuditContext({
        userId: testUser.id,
        ipAddress: "127.0.0.1",
        userAgent: "debug-test-update",
      });

      // Verify context is set
      const userId = cls.get("userId");
      console.log(`   - Context verification - User ID: ${userId}`);

      console.log("   - Performing Recipe.update...");
      console.log("   - WATCH FOR MIDDLEWARE LOGS ABOVE THIS LINE");

      const updatedRecipe = await prisma.recipe.update({
        where: { id: recipe.id },
        data: {
          updatedBy: testUser.id,
          updatedAt: new Date(),
          schemaVersion: `debug-test-${Date.now()}`,
        },
      });

      console.log("   - WATCH FOR MIDDLEWARE LOGS ABOVE THIS LINE");
      console.log(`   - Update completed: ${updatedRecipe.schemaVersion}`);
    });

    const auditLogsAfter = await prisma.auditLog.count();
    console.log(`   - Audit logs after: ${auditLogsAfter}`);
    console.log(
      `   - New audit logs created: ${auditLogsAfter - auditLogsBefore}`
    );

    // Test 4b: Test CREATE operation
    console.log("\n🧪 Test 4b: Test CREATE operation");

    const auditLogsBeforeCreate = await prisma.auditLog.count();
    console.log(`   - Audit logs before create: ${auditLogsBeforeCreate}`);

    await cls.run(async () => {
      console.log("   - Setting audit context for create...");
      auditMiddleware.setAuditContext({
        userId: testUser.id,
        ipAddress: "127.0.0.1",
        userAgent: "debug-test-create",
      });

      console.log("   - Performing Comment.create...");
      console.log("   - WATCH FOR MIDDLEWARE LOGS ABOVE THIS LINE");

      const newComment = await prisma.comment.create({
        data: {
          text: `Test comment created at ${new Date().toISOString()}`,
          recipeId: recipe.id,
          user: testUser.id,
        },
      });

      console.log("   - WATCH FOR MIDDLEWARE LOGS ABOVE THIS LINE");
      console.log(`   - Create completed: ${newComment.id}`);
    });

    const auditLogsAfterCreate = await prisma.auditLog.count();
    console.log(`   - Audit logs after create: ${auditLogsAfterCreate}`);
    console.log(
      `   - New audit logs created by create: ${
        auditLogsAfterCreate - auditLogsBeforeCreate
      }`
    );

    // Test 5: Check audit logs
    console.log("\n🧪 Test 5: Audit log analysis");
    const totalAuditLogs = await prisma.auditLog.count();
    console.log(`   - Total audit logs in system: ${totalAuditLogs}`);

    if (totalAuditLogs > 0) {
      const recentLogs = await prisma.auditLog.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
      });
      console.log("   - Recent audit logs:");
      recentLogs.forEach((log: any, index: number) => {
        console.log(
          `     ${index + 1}. ${log.action} on ${log.entityType} by ${
            log.userId
          }`
        );
      });
    }
  } finally {
    await app.close();
    console.log("\n🏁 Debug test completed");
  }
}

testDebugAudit().catch(console.error);
