import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

async function seedUnitLinks() {
  console.info("Seeding database with UnitLink data...");

  const client = new PrismaClient();

  const unitLinks = [
    {
      name: "Pound",
      pluralName: "Pounds",
      typeName: "Mass (Pound)",
      abbreviation: "lb",
      pluralAbbreviation: "lb",
      conversionRate: 1,
      baseUnit: true,
    },
    {
      name: "Ounce",
      pluralName: "Ounces",
      typeName: "Mass (Pound)",
      abbreviation: "oz",
      pluralAbbreviation: "oz",
      conversionRate: 0.0625,
      baseUnit: false,
    },
    {
      name: "Kilogram",
      pluralName: "Kilograms",
      typeName: "Mass (Pound)",
      abbreviation: "kg",
      pluralAbbreviation: "kg",
      conversionRate: 2.20462,
      baseUnit: false,
    },
    {
      name: "Barley Bushel",
      pluralName: "Barley Bushels",
      typeName: "Mass (Pound)",
      abbreviation: "bsh-b",
      pluralAbbreviation: "bshls-b",
      conversionRate: 38,
      baseUnit: false,
    },
    {
      name: "Wheat Bushel",
      pluralName: "Wheat Bushels",
      typeName: "Mass (Pound)",
      abbreviation: "bsh-w",
      pluralAbbreviation: "bshls-w",
      conversionRate: 56,
      baseUnit: false,
    },
    {
      name: "Corn Bushel",
      pluralName: "Corn Bushels",
      typeName: "Mass (Pound)",
      abbreviation: "bsh-c",
      pluralAbbreviation: "bshls-c",
      conversionRate: 56,
      baseUnit: false,
    },
    {
      name: "Rye Bushel",
      pluralName: "Rye Bushels",
      typeName: "Mass (Pound)",
      abbreviation: "bsh-r",
      pluralAbbreviation: "bshls-r",
      conversionRate: 60,
      baseUnit: false,
    },
    {
      name: "Tote: ENZ-UNI01-Enzyme (Termamyl SC DC)",
      pluralName: "ENZ Tote 01",
      typeName: "Mass (Pound)",
      abbreviation: "tote01",
      pluralAbbreviation: "totes01",
      conversionRate: 544.31,
      baseUnit: false,
    },
    {
      name: "Short Ton",
      pluralName: "Short Ton",
      typeName: "Mass (Pound)",
      abbreviation: "US ton",
      pluralAbbreviation: "US ton",
      conversionRate: 2000,
      baseUnit: false,
    },
  ];

  for (const link of unitLinks) {
    await client.unitLookup.upsert({
      where: {
        name: link.name,
      },
      update: link,
      create: link,
    });
  }
  console.log("UnitLink data seeded successfully.");

  // Find the base unit and its ID
  const baseUnit = await client.unitLookup.findFirst({
    where: { baseUnit: true },
  });

  if (!baseUnit) {
    throw new Error("Base unit (Pound) not found in unitLinks");
  }

  // Link non-base units to the base unit
  for (const link of unitLinks) {
    if (!link.baseUnit) {
      await client.unitLookup.update({
        where: {
          name: link.name,
        },
        data: {
          baseRecord: {
            connect: { id: baseUnit.id },
          },
        },
      });
    }
  }
}

if (require.main === module) {
  dotenv.config();

  seedUnitLinks().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
