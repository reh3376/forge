import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { customSeed } from "./customSeed";
import { Salt, parseSalt } from "../src/auth/password.service";
import { hash } from "bcrypt";

if (require.main === module) {
  dotenv.config();

  const { BCRYPT_SALT } = process.env;

  if (!BCRYPT_SALT) {
    throw new Error("BCRYPT_SALT environment variable must be defined");
  }
  const salt = parseSalt(BCRYPT_SALT);

  seed(salt).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

async function seed(bcryptSalt: Salt) {
  console.info("Seeding database...");

  const client = new PrismaClient();

  const { MES_USER, MES_PASSWORD } = process.env;

  if (!MES_USER || !MES_PASSWORD) {
    throw new Error("MES_USER and MES_PASSWORD environment variables must be defined");
  }

  const data = {
    username: MES_USER,
    password: await hash(MES_PASSWORD, bcryptSalt),
    roles: ["user"],
  };

  await client.user.upsert({
    where: {
      username: data.username,
    },

    update: {},
    create: data,
  });

  void client.$disconnect();

  console.info("Seeding database with custom seed...");
  // customSeed();

  console.info("Seeded database successfully");
}
