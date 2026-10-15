import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";

async function testPrismaMiddleware() {
  console.log("🔍 Testing if Prisma middleware is working...");
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  console.log("📊 Performing a simple findFirst operation...");
  const recipe = await prisma.recipe.findFirst();
  console.log("✅ findFirst completed");

  console.log("📊 Performing a simple count operation...");
  const count = await prisma.recipe.count();
  console.log(`✅ count completed: ${count} recipes`);

  await app.close();
}

testPrismaMiddleware().catch(console.error);
