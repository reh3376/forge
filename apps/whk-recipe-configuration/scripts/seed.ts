import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { customSeed } from "./customSeed";

/*
Developer Team note...

A bug has been found in Amplication that may overwrite this... what it has been overwriting to does not work.
Talk with Patrick if necessary
 */

if (require.main === module) {
  dotenv.config();

  const { BCRYPT_SALT } = process.env;

  if (!BCRYPT_SALT) {
    throw new Error("BCRYPT_SALT environment variable must be defined");
  }
}

async function seed() {
  console.info("Seeding database...");

  const client = new PrismaClient();
  void client.$disconnect();

  console.info("Seeding database with custom seed...");
  customSeed();

  console.info("Seeded database successfully");
}
