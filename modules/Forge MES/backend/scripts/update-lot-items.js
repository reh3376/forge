#!/usr/bin/env node

const fetch = require("node-fetch");

// Configuration
const GRAPHQL_URL = process.env.MES_GRAPHQL_URL || "http://localhost:3000/graphql";
const BEARER_TOKEN = process.env.MES_BEARER_TOKEN;
if (!BEARER_TOKEN) {
  console.error("MES_BEARER_TOKEN environment variable is required");
  process.exit(1);
}
const CREATED_BY = process.env.MES_CREATED_BY || "system";

// GraphQL queries
const GET_ALL_LOTS_QUERY = `
  query GetAllLots {
    lots {
      id
      lotNumber
      status
    }
  }
`;

const UPDATE_LOT_MUTATION = `
  mutation UpdateLot($lotId: String!, $createdBy: String!) {
    updateLot(
      data: { createdBy: $createdBy }
      where: { id: $lotId }
    ) {
      id
      createdBy
      updatedAt
    }
  }
`;

// Helper function to make GraphQL requests
async function makeGraphQLRequest(query, variables = {}) {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BEARER_TOKEN}`,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(result)}`);
  }

  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data;
}

// Main function to process all lots
async function updateLots(testMode = true) {
  try {
    console.log("🔍 Fetching all Lots from the system...");

    // Get all lots
    const lotsData = await makeGraphQLRequest(GET_ALL_LOTS_QUERY);
    const lots = lotsData.lots;

    console.log(`📊 Found ${lots.length} total lots`);

    if (lots.length === 0) {
      console.log("ℹ️ No lots found to update");
      return;
    }

    // Filter out lots with 'Complete' status (they are immutable due to database triggers)
    const updatableLots = lots.filter((lot) => lot.status !== "Complete");
    const immutableLots = lots.filter((lot) => lot.status === "Complete");

    console.log(`✅ Found ${updatableLots.length} updatable lots`);
    console.log(
      `🔒 Found ${immutableLots.length} immutable lots (status: Complete)`
    );

    if (updatableLots.length === 0) {
      console.log("ℹ️ No updatable lots found (all are Complete status)");
      return;
    }

    // In test mode, only process the first updatable lot
    const lotsToProcess = testMode ? updatableLots.slice(0, 1) : updatableLots;

    console.log(
      `🎯 ${testMode ? "TEST MODE: " : ""}Processing ${
        lotsToProcess.length
      } lot(s)...`
    );

    let successCount = 0;
    let errorCount = 0;

    for (const lot of lotsToProcess) {
      try {
        console.log(
          `\n🔄 Processing Lot ${lot.lotNumber} (ID: ${lot.id}) - Status: ${lot.status}`
        );

        // Update the lot
        const updateResult = await makeGraphQLRequest(UPDATE_LOT_MUTATION, {
          lotId: lot.id,
          createdBy: CREATED_BY,
        });

        console.log(
          `   ✅ Successfully updated Lot ${updateResult.updateLot.id}`
        );
        console.log(`   📝 Created by: ${updateResult.updateLot.createdBy}`);
        console.log(`   📅 Updated at: ${updateResult.updateLot.updatedAt}`);
        successCount++;

        // Add a small delay between requests to be nice to the server
        if (!testMode && lotsToProcess.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(
          `   ❌ Error updating Lot ${lot.lotNumber}:`,
          error.message
        );
        errorCount++;
      }
    }

    console.log(`\n📈 Summary:`);
    console.log(`   ✅ Successfully updated: ${successCount} lots`);
    console.log(`   ❌ Errors: ${errorCount} lots`);

    if (testMode && successCount > 0) {
      console.log(
        `\n🎉 Test completed successfully! You can now run with testMode=false to process all lots.`
      );
    }
  } catch (error) {
    console.error("💥 Fatal error:", error.message);
    process.exit(1);
  }
}

// Command line argument parsing
const args = process.argv.slice(2);
const testMode = !args.includes("--production");

if (testMode) {
  console.log("🧪 Running in TEST MODE - will only update 1 lot");
  console.log(
    "   To update all lots, use: node update-lot-items.js --production"
  );
} else {
  console.log("🚀 Running in PRODUCTION MODE - will update ALL lots");
}

// Run the script
updateLots(testMode).catch((error) => {
  console.error("💥 Unhandled error:", error);
  process.exit(1);
});
