#!/usr/bin/env node

const fetch = require('node-fetch');

// Configuration
const GRAPHQL_URL = 'http://10.4.8.25:3000/graphql';
const BEARER_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbHljbnZ5Y2owMDAwNm5pMGEweWlteHJvIiwidXNlcm5hbWUiOiJtZXMiLCJpYXQiOjE3NTM5Njk0MjQsImV4cCI6MTc1Mzk3MzAyNH0.1mau9gdEHQuRNy6TtnjzFUkV4GLRRG-rHHgBbHdzHgw';
const CREATED_BY = 'pmannion@whiskeyhouse.com';

// GraphQL queries
const GET_ALL_ITEMS_QUERY = `
  query GetAllItems {
    items {
      id
      itemNumber
      itemName
      active
    }
  }
`;

const UPDATE_ITEM_MUTATION = `
  mutation UpdateItem($itemId: String!, $createdBy: String!) {
    updateItem(
      data: { createdBy: $createdBy }
      where: { id: $itemId }
    ) {
      id
      itemNumber
      itemName
      createdBy
      updatedAt
    }
  }
`;

// Helper function to make GraphQL requests
async function makeGraphQLRequest(query, variables = {}) {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BEARER_TOKEN}`,
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

// Main function to process all items
async function updateItems(testMode = true) {
  try {
    console.log('🔍 Fetching all Items from the system...');
    
    // Get all items
    const itemsData = await makeGraphQLRequest(GET_ALL_ITEMS_QUERY);
    const items = itemsData.items;
    
    console.log(`📊 Found ${items.length} total items`);
    
    if (items.length === 0) {
      console.log('ℹ️ No items found to update');
      return;
    }
    
    // Filter out inactive items (they might be considered immutable)
    const updatableItems = items.filter(item => item.active !== false);
    const inactiveItems = items.filter(item => item.active === false);
    
    console.log(`✅ Found ${updatableItems.length} updatable items`);
    console.log(`🔒 Found ${inactiveItems.length} inactive items`);
    
    if (updatableItems.length === 0) {
      console.log('ℹ️ No updatable items found (all are inactive)');
      return;
    }
    
    // In test mode, only process the first updatable item
    const itemsToProcess = testMode ? updatableItems.slice(0, 1) : updatableItems;
    
    console.log(`🎯 ${testMode ? 'TEST MODE: ' : ''}Processing ${itemsToProcess.length} item(s)...`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const item of itemsToProcess) {
      try {
        console.log(`\n🔄 Processing Item ${item.itemNumber} - ${item.itemName} (ID: ${item.id}) - Active: ${item.active}`);
        
        // Update the item
        const updateResult = await makeGraphQLRequest(UPDATE_ITEM_MUTATION, {
          itemId: item.id,
          createdBy: CREATED_BY,
        });
        
        console.log(`   ✅ Successfully updated Item ${updateResult.updateItem.id}`);
        console.log(`   📋 Item Number: ${updateResult.updateItem.itemNumber}`);
        console.log(`   🏷️ Item Name: ${updateResult.updateItem.itemName}`);
        console.log(`   📝 Created by: ${updateResult.updateItem.createdBy}`);
        console.log(`   📅 Updated at: ${updateResult.updateItem.updatedAt}`);
        successCount++;
        
        // Add a small delay between requests to be nice to the server
        if (!testMode && itemsToProcess.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        console.error(`   ❌ Error updating Item ${item.itemNumber}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`\n📈 Summary:`);
    console.log(`   ✅ Successfully updated: ${successCount} items`);
    console.log(`   ❌ Errors: ${errorCount} items`);
    
    if (testMode && successCount > 0) {
      console.log(`\n🎉 Test completed successfully! You can now run with testMode=false to process all items.`);
    }
    
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  }
}

// Command line argument parsing
const args = process.argv.slice(2);
const testMode = !args.includes('--production');

if (testMode) {
  console.log('🧪 Running in TEST MODE - will only update 1 item');
  console.log('   To update all items, use: node update-item-records.js --production');
} else {
  console.log('🚀 Running in PRODUCTION MODE - will update ALL items');
}

// Run the script
updateItems(testMode).catch(error => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});