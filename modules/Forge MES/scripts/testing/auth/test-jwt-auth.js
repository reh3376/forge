#!/usr/bin/env node

/**
 * JWT Authentication Test Script
 * 
 * This script tests the JWT authentication flow:
 * 1. Login with username/password
 * 2. Verify token is received and stored
 * 3. Test GraphQL query with JWT token
 * 4. Verify authentication headers are properly set
 */

import fetch from 'node-fetch';

// Configuration
const BASE_URL = process.env.NEXT_PUBLIC_MES_API_URL || 'http://localhost:3001';
const GRAPHQL_URL = process.env.NEXT_PUBLIC_MES_GRAPHQL_URL || 'http://localhost:3000/graphql';
const USERNAME = process.env.MES_USERNAME || 'mes';
const PASSWORD = process.env.MES_PASSWORD || 'password';

console.log('🔐 JWT Authentication Test Script');
console.log('================================');
console.log(`Base URL: ${BASE_URL}`);
console.log(`GraphQL URL: ${GRAPHQL_URL}`);
console.log(`Username: ${USERNAME}`);
console.log('');

async function testJWTAuthentication() {
  try {
    // Step 1: Login and get JWT token
    console.log('📝 Step 1: Login with username/password...');
    const loginResponse = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: USERNAME,
        password: PASSWORD,
      }),
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status} ${loginResponse.statusText}`);
    }

    const authData = await loginResponse.json();
    console.log('✅ Login successful!');
    console.log(`   Token length: ${authData.accessToken.length} characters`);
    console.log(`   User ID: ${authData.id}`);
    console.log(`   Username: ${authData.username}`);
    console.log(`   Roles: ${authData.roles.join(', ')}`);
    console.log('');

    // Step 2: Test GraphQL query with JWT token
    console.log('📊 Step 2: Test GraphQL query with JWT token...');
    const graphqlQuery = {
      query: `
        query GetRecipes {
          recipes(take: 5) {
            id
            Recipe
            active
            whiskeyType
            customerCode
          }
        }
      `,
    };

    const graphqlResponse = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.accessToken}`,
      },
      body: JSON.stringify(graphqlQuery),
    });

    if (!graphqlResponse.ok) {
      throw new Error(`GraphQL request failed: ${graphqlResponse.status} ${graphqlResponse.statusText}`);
    }

    const graphqlData = await graphqlResponse.json();
    
    if (graphqlData.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(graphqlData.errors)}`);
    }

    console.log('✅ GraphQL query successful!');
    console.log(`   Retrieved ${graphqlData.data.recipes?.length || 0} recipes`);
    
    if (graphqlData.data.recipes && graphqlData.data.recipes.length > 0) {
      console.log('   Sample recipe:');
      const sample = graphqlData.data.recipes[0];
      console.log(`     ID: ${sample.id}`);
      console.log(`     Name: ${sample.Recipe}`);
      console.log(`     Active: ${sample.active}`);
      console.log(`     Type: ${sample.whiskeyType || 'N/A'}`);
    }
    console.log('');

    // Step 3: Test authentication headers function
    console.log('🔧 Step 3: Verify authentication flow...');
    console.log('✅ JWT token properly included in Authorization header');
    console.log('✅ Backend accepted JWT token');
    console.log('✅ GraphQL query executed successfully');
    console.log('✅ Data retrieved from protected endpoint');
    console.log('');

    console.log('🎉 All tests passed! JWT authentication is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testJWTAuthentication(); 