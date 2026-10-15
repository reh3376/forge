/**
 * Manual Test Script for Recipe Name Functionality
 *
 * This script can be used to manually test the new recipe name functionality
 * by making HTTP requests to the lot endpoints.
 */

const axios = require("axios");

const BASE_URL = "http://localhost:3000"; // Adjust as needed
const API_URL = `${BASE_URL}/lots`;

// Test data
const testData = {
  // Test creating lot with recipe name
  createWithRecipeName: {
    recipeName: "Test American Single Malt Recipe",
    whiskeyType: "AmericanSingleMalt",
    bblOem: "WVG",
    lotAlphaChar: "T",
    lotNumber: "",
    createdBy: "test-script",
    bblEntryProof: 125.5,
    totalWeight: 1500,
    densityFinal: 8.2,
    bblTotal: 15,
    notes: "Created via test script with recipe name",
  },

  // Test creating lot with existing recipe ID (backward compatibility)
  createWithRecipeId: {
    recipe: { connect: { id: "existing-recipe-id" } }, // Replace with actual recipe ID
    bblOem: "ISC",
    lotAlphaChar: "S",
    lotNumber: "",
    createdBy: "test-script",
    bblEntryProof: 115.0,
    totalWeight: 1200,
    densityFinal: 8.0,
    bblTotal: 12,
    notes: "Created via test script with recipe ID",
  },

  // Test whiskey type detection
  whiskeyTypeTests: [
    {
      recipeName: "Single Malt Test Recipe",
      expectedDetection: "MaltWhiskey",
      bblOem: "WVG",
      lotAlphaChar: "M",
    },
    {
      recipeName: "Wheat Bourbon Test Recipe",
      expectedDetection: "WheatedBourbon",
      bblOem: "WVG",
      lotAlphaChar: "W",
    },
    {
      recipeName: "Rye Whiskey Test Recipe",
      expectedDetection: "RyeWhiskey",
      bblOem: "WVG",
      lotAlphaChar: "R",
    },
    {
      recipeName: "Four Grain Bourbon Test Recipe",
      expectedDetection: "FourGrainBourbon",
      bblOem: "WVG",
      lotAlphaChar: "F",
    },
  ],
};

async function testCreateLotWithRecipeName() {
  console.log("\n🧪 Testing: Create Lot with Recipe Name");
  console.log("==========================================");

  try {
    const response = await axios.post(API_URL, testData.createWithRecipeName);
    console.log("✅ SUCCESS: Lot created with recipe name");
    console.log(`   Lot ID: ${response.data.id}`);
    console.log(`   Lot Number: ${response.data.lotNumber}`);
    console.log(`   Recipe Name: ${testData.createWithRecipeName.recipeName}`);
    return response.data;
  } catch (error) {
    console.log("❌ FAILED: Could not create lot with recipe name");
    console.log(`   Error: ${error.response?.data?.message || error.message}`);
    return null;
  }
}

async function testCreateLotWithRecipeId() {
  console.log(
    "\n🧪 Testing: Create Lot with Recipe ID (Backward Compatibility)"
  );
  console.log("============================================================");

  try {
    const response = await axios.post(API_URL, testData.createWithRecipeId);
    console.log("✅ SUCCESS: Lot created with recipe ID");
    console.log(`   Lot ID: ${response.data.id}`);
    console.log(`   Lot Number: ${response.data.lotNumber}`);
    return response.data;
  } catch (error) {
    console.log("❌ FAILED: Could not create lot with recipe ID");
    console.log(`   Error: ${error.response?.data?.message || error.message}`);
    return null;
  }
}

async function testWhiskeyTypeDetection() {
  console.log("\n🧪 Testing: Whiskey Type Detection");
  console.log("==================================");

  for (const test of testData.whiskeyTypeTests) {
    try {
      const lotData = {
        ...test,
        lotNumber: "",
        createdBy: "test-script",
        bblEntryProof: 120.0,
        totalWeight: 1000,
        densityFinal: 8.0,
        bblTotal: 10,
        notes: `Testing ${test.expectedDetection} detection`,
      };

      const response = await axios.post(API_URL, lotData);
      console.log(`✅ SUCCESS: ${test.recipeName}`);
      console.log(`   Expected: ${test.expectedDetection}`);
      console.log(`   Lot ID: ${response.data.id}`);
      console.log(`   Lot Number: ${response.data.lotNumber}`);
    } catch (error) {
      console.log(`❌ FAILED: ${test.recipeName}`);
      console.log(
        `   Error: ${error.response?.data?.message || error.message}`
      );
    }
  }
}

async function testUpdateLotWithRecipeName(lotId) {
  console.log("\n🧪 Testing: Update Lot with Recipe Name");
  console.log("=======================================");

  const updateData = {
    recipeName: "Updated Test Recipe Name",
    whiskeyType: "WheatWhiskey",
    notes: "Updated via test script with new recipe name",
    bblEntryProof: 118.5,
  };

  try {
    const response = await axios.patch(`${API_URL}/${lotId}`, updateData);
    console.log("✅ SUCCESS: Lot updated with recipe name");
    console.log(`   Updated Lot ID: ${response.data.id}`);
    console.log(`   New Recipe Name: ${updateData.recipeName}`);
    console.log(`   Updated Notes: ${response.data.notes}`);
    return response.data;
  } catch (error) {
    console.log("❌ FAILED: Could not update lot with recipe name");
    console.log(`   Error: ${error.response?.data?.message || error.message}`);
    return null;
  }
}

async function testErrorConditions() {
  console.log("\n🧪 Testing: Error Conditions");
  console.log("============================");

  // Test missing both recipe and recipeName
  const invalidData = {
    bblOem: "WVG",
    lotAlphaChar: "E",
    lotNumber: "",
    createdBy: "test-script",
    bblEntryProof: 120.0,
    totalWeight: 1000,
    densityFinal: 8.0,
    bblTotal: 10,
  };

  try {
    await axios.post(API_URL, invalidData);
    console.log("❌ UNEXPECTED: Should have failed without recipe info");
  } catch (error) {
    console.log("✅ SUCCESS: Correctly rejected request without recipe info");
    console.log(
      `   Expected Error: ${error.response?.data?.message || error.message}`
    );
  }
}

async function runAllTests() {
  console.log("🚀 Starting Recipe Name Functionality Tests");
  console.log("===========================================");
  console.log(`Target API: ${API_URL}`);

  // Test 1: Create lot with recipe name
  const createdLot = await testCreateLotWithRecipeName();

  // Test 2: Create lot with recipe ID (if you have a valid recipe ID)
  // await testCreateLotWithRecipeId();

  // Test 3: Test whiskey type detection
  await testWhiskeyTypeDetection();

  // Test 4: Update lot with recipe name (if lot was created successfully)
  if (createdLot) {
    await testUpdateLotWithRecipeName(createdLot.id);
  }

  // Test 5: Error conditions
  await testErrorConditions();

  console.log("\n🏁 Tests Completed");
  console.log("==================");
  console.log(
    "Review the results above to verify functionality is working correctly."
  );
}

// Usage instructions
if (require.main === module) {
  console.log(`
📋 Recipe Name Functionality Test Script
========================================

This script tests the new recipe name functionality for lot creation and updates.

Prerequisites:
1. Make sure your API server is running on ${BASE_URL}
2. Ensure you have valid test data (production orders, customers, etc.)
3. Update the BASE_URL constant if your server runs on a different port

To run: node test-recipe-name-functionality.js
`);

  runAllTests().catch(console.error);
} else {
  module.exports = {
    testCreateLotWithRecipeName,
    testCreateLotWithRecipeId,
    testWhiskeyTypeDetection,
    testUpdateLotWithRecipeName,
    testErrorConditions,
    runAllTests,
  };
}
