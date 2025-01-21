// import modules
const XLSX = require("xlsx");
const fs = require("fs");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

const addPOSTFIX = (postfix, addToThis) => {
  return addToThis + postfix;
};

const spaceToDash = (spacedString) => {
  return spacedString.replace(/ /g, "-");
};

const addPOSTFIXandSpaceToDash = (postfix, addToThis) => {
  return spaceToDash(addPOSTFIX(postfix, addToThis));
};

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

    return renamedRow;
  });
  console.log("🚀 ~ renamedData:", renamedData);

  // Save renamed data to a JSON file
  fs.writeFileSync(
    "renamedData.json",
    JSON.stringify(renamedData, null, 2),
    "utf8"
  );
  const getOrCreateCustomer = async (
    customerName = "Default Customer",
    createdBy = "system"
  ) => {
    // Ensure a default value is always used if customerName is undefined or null
    const customerToUse = customerName || "Default Customer";

    // Find an existing customer by name
    const existingCustomer = await prisma.customer.findFirst({
      where: { name: customerToUse },
    });

    if (existingCustomer) {
      return { connect: { id: existingCustomer.id } };
    }

    // Create a new customer if not found
    const newCustomer = await prisma.customer.create({
      data: {
        name: customerToUse,
        address: "Default Address", // Provide a default address
        createdBy, // Use the provided or default value for createdBy
      },
    });

    return { connect: { id: newCustomer.id } };
  };

  const getOrCreateRecipe = async (
    recipeName,
    customerName,
    createdBy = "Micheal Palliparambil"
  ) => {
    if (!recipeName) return undefined;

    const customerRelation = await getOrCreateCustomer(customerName);

    const existingRecipe = await prisma.recipe.findFirst({
      where: { Recipe: recipeName },
    });

    if (existingRecipe) {
      return { connect: { id: existingRecipe.id } };
    }

    // If not found, create a new recipe and return its ID
    const newRecipe = await prisma.recipe.create({
      data: { Recipe: recipeName, createdBy, customer: customerRelation },
    });

    return { connect: { id: newRecipe.id } };
  };

  function adjustLotNumber(lotNumber, barrelType) {
    // Check if the lot number already contains a dot and has the correct format
    if (lotNumber && /\.\d{2}$/.test(lotNumber)) {
      return lotNumber; // Return as is if already correct
    }

    // Determine the postfix based on the barrel type
    const postfix =
      barrelType === "WVBC" ? ".01" : barrelType === "ISC" ? ".10" : ".99"; // Default to .07 if neither WVBC nor ISC

    // Append the postfix if the lot number doesn't already have it
    return lotNumber && postfix ? `${lotNumber}${postfix}` : lotNumber;
  }

  // TODO: connect container item id
  // TODO: connect fg item id
  // TODO: connect production order id

  // Seed the database
  async function seedDatabase() {
    console.info("Starting database seeding...");

    for (const data of renamedData) {
      try {
        const recipeRelation = await getOrCreateRecipe(data.recipe);

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
  console.log(
    "node env is not developement, please run the script in dev mode"
  );
}
