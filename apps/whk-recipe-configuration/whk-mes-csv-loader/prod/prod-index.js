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
import amqp from 'amqplib';

// Get the directory path for the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure dotenv with the correct path
dotenv.config({ path: path.resolve(__dirname, '../../.env') });


const prisma = new PrismaClient();

// setup the file path manually on every run
const FILEPATH = "./Production-WHK WHSE TTB.upload-for-backend1.CLEAN.xlsx";

// Add RabbitMQ connection setup
const RABBITMQ_URL = process.env.RABBITMQ_URLS || 'amqp://localhost:5672';
const EXCHANGE_NAME = 'wh.whk01.distillery01.lot';

async function sendToRabbitMQ(data) {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    
    await channel.assertExchange(EXCHANGE_NAME, 'fanout', { durable: true });
    
    const message = {
      pattern: EXCHANGE_NAME,
      data: {
        recordName: 'Lot',
        event_type: data.action,
        data: data.lot
      }
    };

    await channel.publish(
      EXCHANGE_NAME,
      '',  // routing key is empty for fanout exchanges
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );
    
    console.log(`Message sent to RabbitMQ: ${JSON.stringify(message)}`);
    
    await channel.close();
    await connection.close();
  } catch (error) {
    console.error('Error sending message to RabbitMQ:', error);
  }
}

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
      const adjustedLotNumber = adjustLotNumber(data['LOT #'], data.bblType);
      console.log("🚀 ~ adjustedLotNumber:", adjustedLotNumber);

      const lotData = {
        avgBblFillByPg: data["Avg. Bbl Fill: by PG"],
        avgBblFillByWg: data["Avg. Bbl Fill: by WG"],
        avgPGsFerm: data.avgPGsFerm,
        bblOem: data.bblOem === "WVGBC" ? "WVG" : data['Bbl OEM:'],
        bblEntryProof: data['Bbl Entry Proof: Pdi'],
        grainLbsFerm: data.grainLbsFerm,
        densityFinal: data['Density (final): Df'],
        grainLbsPg: data.grainLbsPg,
        filledFromString: data['Tank of Origin:'],
        standardYield: data.standardYield,
        pgLosses: data['PG Losses:'] || 0,
        totalFermenters: data.totalFermenters,
        totalVolumeWg: data['Total WGs'],
        totalPGsByRecipe: data['Total PGs'],
        confirmed: true,
        whiskeyType:
          data['Whiskey Type:'] === "Select Type"
            ? "RyeBourbon"
            : data['Whiskey Type:']?.replace(/\s+/g, ""),
        totalWGs: data['Total WGs'],
        notes: typeof data['Notes: '] === 'string' ? data['Notes: '] : null,
        totalPGs: data['Total PGs'],
        bblTotal: data['Bbl Total:'],
        bblType: data['Bbl Type:'],
        lotNumber: adjustedLotNumber,
        proofInitial: data['Proof (Initial): Pdi'],
        createdBy: 'pmannion@whiskeyhouse.com',
        lotCreatedAt: (() => {
          const year = `20${adjustedLotNumber.substring(0, 2)}`;
          const monthChar = adjustedLotNumber.charAt(2);
          const day = adjustedLotNumber.substring(3, 5);
          const month = "ABCDEFGHIJKL".indexOf(monthChar) + 1;
          return new Date(`${year}-${month}-${day}`);
        })(),
        warehouseEntryNumber: parseInt(data['WHK_WHSE#:'], 10) || null,
        totalWeight: data['Total  Weight: lbs - Wt'],
        lotAlphaChar: adjustedLotNumber.charAt(5) || null,
        status: data.status || "Complete",
        recipe: recipeRelation,
        productionOrder: data.productionOrderId
          ? {
              connect: {
                id: data.productionOrderId
              }
            }
          : undefined
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
        await sendToRabbitMQ({ action: 'update', lot });
      } else {
        // Create new lot
        lot = await prisma.lot.create({
          data: lotData,
        });
        await sendToRabbitMQ({ action: 'create', lot });
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
