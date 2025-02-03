// Import modules
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import fs, { rename } from "fs";
import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";
import {
  addPOSTFIXandSpaceToDash,
  adjustLotNumber,
  findRelatedIdsByRecipe,
  getCustomerIdByRecipe,
  getRecipeIfExists,
} from "./functions/prod-functions.js";

// Get the directory path for the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure dotenv with the correct path
dotenv.config({ path: path.resolve(__dirname, '../../.env') });


const prisma = new PrismaClient();

// setup the file path manually on every run
const FILEPATH = "./Production-WHK WHSE TTB.upload-for-backend1.CLEAN.xlsx";

// Seed the database
async function seedDatabase(renamedData) {
  console.info("Starting database seeding...");

  for (const data of renamedData) {
    // try {
      const recipeRelation = await getRecipeIfExists(
        data.recipe,
        data.createdBy,
        prisma
      );
      console.log(`Data: ${JSON.stringify(data)}`);

      // Adjust the lot number based on the rules
      const adjustedLotNumber = adjustLotNumber(data.lotNumber, data.bblType);
      console.log("🚀 ~ adjustedLotNumber:", adjustedLotNumber);

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

      console.log("🚀 ~ lotData:", lotData);

      const existingLot = await prisma.lot.findFirst({
        where: { lotNumber: lotData.lotNumber },
      });
      let lot = existingLot;
      if (existingLot) {
        // Update existing lot
        lot = await prisma.lot.update({
          where: { id: existingLot.id },
          data: lotData,
        });
      } else {
        // Create new lot
        lot = await prisma.lot.create({
          data: lotData,
        });
      }

      console.info(`Successfully seeded lot: ${lot.lotNumber}`);
    // } catch (error) {
    //   console.error(`Error seeding lot: ${data.lotNumber}`, error);
    // }
  }

  console.info("Database seeding completed!");
  await prisma.$disconnect();
}

// Main execution block
console.log("🚀 ~ process.env.NODE_ENV:", process.env.NODE_ENV);
console.log(`DB Name: ${process.env.DB_NAME}`);
if (process.env.NODE_ENV === "production") {
  // // File path
  // const filePath = FILEPATH;

  // const workbook = XLSX.readFile(filePath);

  // const sheetName = workbook.SheetNames[0];
  // const sheets = workbook.Sheets[sheetName];

  // // Read Excel
  // const [header, ...jsonData] = XLSX.utils.sheet_to_json(sheets, { header: 1 });

  const filePath = FILEPATH;
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Get the range of cells that contain data
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const header = [];
  const jsonData = [];

  // Read header row
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellAddress = XLSX.utils.encode_cell({r: range.s.r, c: C});
    const cell = sheet[cellAddress];
    header.push(cell ? cell.v : null);
  }

  // Read data rows
  for (let R = range.s.r + 1; R <= range.e.r; ++R) {
    const row = [];
    let hasData = false;
    
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({r: R, c: C});
      const cell = sheet[cellAddress];
      const value = cell ? cell.v : null;
      row.push(value);
      if (value !== null) hasData = true;
    }

    // Only add rows that contain data
    if (hasData) {
      jsonData.push(row);
    }
  }

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

      console.log("🚀 ~ renamedRow 1:", JSON.stringify(renamedRow));

      if (renamedRow.recipe) {
        renamedRow.recipe = addPOSTFIXandSpaceToDash("-R01", renamedRow.recipe);
      }
      console.log("🚀 ~ renamedRow 2:", renamedRow);

      // const { productionOrderId, containerId, fgItemId } =
      const { recipeId, customerID, productionOrderId, itemId } =
        await findRelatedIdsByRecipe(
          renamedRow.recipe,
          prisma,
          renamedRow.createdBy
        );

      // renamedRow.productionOrderId = productionOrderId;
      // renamedRow.containerId = containerId;
      // renamedRow.fgItemId = fgItemId;
      renamedRow.recipeId = recipeId;
      renamedRow.customerID = customerID;
      renamedRow.fgItemId = itemId;
      renamedRow.productionOrderId = productionOrderId || null;

      // console.log("🚀 ~ renamedRow:", renamedRow);
      return renamedRow;
    })
  )
    .then((renamedData) => {
      // console.log("🚀 ~ renamedData:", renamedData);

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
