// Import modules
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import fs from "fs";
import XLSX from "xlsx";
import {
  addPOSTFIXandSpaceToDash,
  adjustLotNumber,
  findRelatedIdsByRecipe,
  getCustomerIdByRecipe,
  getRecipeIfExists,
} from "./functions/prod-functions.js";

dotenv.config();
const prisma = new PrismaClient();

// setup the file path manually on every run
const FILEPATH = "./Production-WHK WHSE TTB.upload-for-backend1.CLEAN.xlsx";

// Seed the database
async function seedDatabase(renamedData) {
  console.info("Starting database seeding...");

  for (const data of renamedData) {
    try {
      const recipeRelation = await getRecipeIfExists(
        data.recipe,
        data.createdBy,
        prisma
      );

      // Adjust the lot number based on the rules
      const adjustedLotNumber = adjustLotNumber(data.lotNumber, data.bblType);

      const lotData = {
        avgBblFillByPg: data.avgBblFillByPg,
        avgBblFillByWg: data.avgBblFillByWg,
        avgPGsFerm: data.avgPGsFerm,
        bblOem: data.bblOem === "WVGBC" ? "WVG" : data.bblOem,
        bblEntryProof: data.bblEntryProof,
        grainLbsFerm: data.grainLbsFerm,
        densityFinal: data.densityFinal,
        grainLbsPg: data.grainLbsPg,
        standardYield: data.standardYield,
        pgLosses: data.pgLosses || 0,
        totalFermenters: data.totalFermenters,
        totalVolumeWg: data.totalVolumeWg,
        totalPGsByRecipe: data.totalPGsByRecipe,
        confirmed: true,
        whiskeyType:
          data.whiskeyType === "Select Type"
            ? "RyeBourbon"
            : data.whiskeyType?.replace(/\s+/g, ""),
        totalWGs: data.totalWGs,
        notes: data.notes,
        totalPGs: data.totalPGs,
        bblTotal: data.bblTotal,
        bblType: data.bblType,
        lotNumber: adjustedLotNumber,
        lotCreatedAt: data.lotCreatedAt
          ? new Date((Number(data.lotCreatedAt) - 25569) * 86400 * 1000) // Convert Excel date
          : null,
        warehouseEntryNumber: parseInt(data.warehouseEntryNumber, 10) || null,
        totalWeight: data.totalWeight,
        lotAlphaChar: data.lotAlphaChar,
        status: data.status || "Complete",
        recipe: recipeRelation,
        productionOrder: data.productionOrder
          ? {
              connectOrCreate: {
                where: { id: data.productionOrderId },
                create: {
                  id: data.productionOrderId,
                  status: "Initiated",
                },
              },
            }
          : undefined,
      };

      await prisma.lot.upsert({
        where: { lotNumber: lotData.lotNumber },
        update: lotData,
        create: lotData,
      });

      console.info(`Successfully seeded lot: ${lotData.lotNumber}`);
    } catch (error) {
      console.error(`Error seeding lot: ${data.lotNumber}`, error);
    }
  }

  console.info("Database seeding completed!");
  await prisma.$disconnect();
}

// Main execution block
if (process.env.NODE_ENV === "production") {
  // File path
  const filePath = FILEPATH;

  const workbook = XLSX.readFile(filePath);

  const sheetName = workbook.SheetNames[0];
  const sheets = workbook.Sheets[sheetName];

  // Read Excel
  const [header, ...jsonData] = XLSX.utils.sheet_to_json(sheets, { header: 1 });

  // Original key mappings
  const keyMappings = {
    Mashbill: "recipe",
    // Other key mappings...
  };

  // Rename keys and resolve customer IDs
  Promise.all(
    jsonData.map(async (row) => {
      const renamedRow = {};
      header.forEach((key, index) => {
        const mappedKey = keyMappings[key] || key;
        renamedRow[mappedKey] = row[index] || null;
      });

      if (renamedRow.recipe) {
        renamedRow.recipe = addPOSTFIXandSpaceToDash("-R01", renamedRow.recipe);
      }

      const { productionOrderId, containerId, fgItemId } =
        await findRelatedIdsByRecipe(
          renamedRow.recipe,
          prisma,
          renamedRow.createdBy
        );

      renamedRow.productionOrderId = productionOrderId;
      renamedRow.containerId = containerId;
      renamedRow.fgItemId = fgItemId;

      console.log("🚀 ~ renamedRow:", renamedRow);
      return renamedRow;
    })
  )
    .then((renamedData) => {
      console.log("🚀 ~ renamedData:", renamedData);

      // Save renamed data to a JSON file
      fs.writeFileSync(
        "prod-renamedData.json",
        JSON.stringify(renamedData, null, 2),
        "utf8"
      );

      // Execute seeding
      seedDatabase(renamedData).catch((error) => {
        console.error("Seeding failed:", error);
        process.exit(1);
      });
    })
    .catch((error) => console.error("Data processing failed:", error));
} else {
  console.log(
    "node env is not production, please run the script in production mode"
  );
}
