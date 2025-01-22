// import modules
const XLSX = require("xlsx");
const fs = require("fs");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");
const {
  addPOSTFIXandSpaceToDash,
  getOrCreateRecipe,
  findRelatedIdsByRecipe,
} = require("./functions/index");

if (process.env.NODE_ENV === "development") {
  const prisma = new PrismaClient();
  dotenv.config();

  // File path
  const filePath =
    "E:/Github/whk-mes/apps/whk-recipe-configuration/whk-mes-csv-loader/WHK WHSE TTB.upload-for-backend1.CLEAN.xlsx";

  const workbook = XLSX.readFile(filePath);

  const sheetName = workbook.SheetNames[0];
  const sheets = workbook.Sheets[sheetName];

  // Read Excel
  const [header, ...jsonData] = XLSX.utils.sheet_to_json(sheets, { header: 1 });

  // Original key mappings (backend schema to spreadsheet column names)
  const keyMappings = {
    "Avg. Bbl Fill: by PG": "avgBblFillByPg",
    "Avg. Bbl Fill: by WG": "avgBblFillByWg",
    "Avg PGs / Ferm": "avgPGsFerm",
    "Bbl OEM:": "bblOem",
    "Bbl Entry Proof: Pdi": "bblEntryProof",
    "Grain - lbs / Ferm": "grainLbsFerm",
    "Density (final): Df": "densityFinal",
    "Grain - lbs / PG": "grainLbsPg",
    "Standard Yield (PGs/56#)": "standardYield",
    "PG Losses": "pgLosses",
    "Total Ferms": "totalFermenters",
    "Total Volume: WG": "totalVolumeWg",
    "Total PGs by Recipe": "totalPGsByRecipe",
    Confirmed: "confirmed",
    "Whiskey Type": "whiskeyType",
    "Total WGs": "totalWGs",
    Notes: "notes",
    "Total PGs": "totalPGs",
    "Bbl Total": "bblTotal",
    "Bbl Type": "bblType",
    "LOT #": "lotNumber",
    Date: "lotCreatedAt",
    "WHK_WHSE#:": "warehouseEntryNumber",
    Mashbill: "recipe",
    "Total Weight: lbs": "totalWeight",
    "Production Order ID": "productionOrder",
    Complete: "status",
    "Custom Backend": "lotAlphaChar",
  };

  // Rename keys in each row
  const renamedData = jsonData.map(async (row) => {
    const renamedRow = {};
    header.forEach((key, index) => {
      const mappedKey = keyMappings[key] || key; // Map to the new key or keep the original
      renamedRow[mappedKey] = row[index] || null; // Assign value to the new key
    });
    // Add postfix to the mashbill field if it exists
    if (renamedRow.recipe) {
      renamedRow.recipe = addPOSTFIXandSpaceToDash("-R01", renamedRow.recipe);
    }
    // Find productionOrderId, containerId, and fgItemId
    const { productionOrderId, containerId, fgItemId } =
      await findRelatedIdsByRecipe(renamedRow.recipe);

    renamedRow.productionOrderId = productionOrderId;
    renamedRow.containerId = containerId;
    renamedRow.fgItemId = fgItemId;

    return renamedRow;
  });
  console.log("🚀 ~ renamedData:", renamedData);

  // Save renamed data to a JSON file
  fs.writeFileSync(
    "renamedData.json",
    JSON.stringify(renamedData, null, 2),
    "utf8"
  );

  // TODO: connect container item id
  // TODO: connect fg item id
  // TODO: connect production order id

  // Seed the database
  async function seedDatabase() {
    console.info("Starting database seeding...");

    for (const data of renamedData) {
      try {
        const recipeRelation = await getOrCreateRecipe(data.recipe); //TODO: SETUP customer name

        // Adjust the lot number based on the rules
        const adjustedLotNumber = adjustLotNumber(data.lotNumber, data.bblType);

        const lotData = {
          avgBblFillByPg: data.avgBblFillByPg,
          avgBblFillByWg: data.avgBblFillByWg,
          avgPGsFerm: data.avgPGsFerm,
          bblOem: data.bblOem,
          bblEntryProof: data.bblEntryProof,
          grainLbsFerm: data.grainLbsFerm,
          densityFinal: data.densityFinal,
          grainLbsPg: data.grainLbsPg,
          standardYield: data.standardYield,
          pgLosses: data.pgLosses,
          totalFermenters: data.totalFermenters,
          totalVolumeWg: data.totalVolumeWg,
          totalPGsByRecipe: data.totalPGsByRecipe,
          confirmed: data.confirmed === "X",
          whiskeyType: data.whiskeyType,
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
          status: data.status || "Started",
          recipe: recipeRelation,
          // productionOrder: data.productionOrder
          //   ? {
          //       connectOrCreate: {
          //         where: { id: data.productionOrder },
          //         create: {
          //           id: data.productionOrder,
          //           status: "Initiated",
          //         },
          //       },
          //     }
          //   : undefined,
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

  // Execute seeding
  seedDatabase().catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  });
} else {
  console.log("node env is not development, please run the script in dev mode");
}
