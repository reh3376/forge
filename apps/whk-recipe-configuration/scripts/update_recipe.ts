import fetch from 'node-fetch';
import * as dotenv from "dotenv";
import path from 'path';

// Update the path to be relative to the current file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Add validation for required environment variables
const requiredEnvVars = ['MES_USER', 'MES_PASSWORD', 'NODE_ENV'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}


const login = async (username: string, password: string) => {
  const apiEndpoint = process.env.NODE_ENV === 'production' ? 'http://10.4.8.25/api/auth/login' :  `http://localhost:${process.env.PORT}/api/login`;
  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.statusText}`);
  }

  const result = await response.json();
  
  console.log(result);
  return result['accessToken'];
};


const getAllRecipes = async () => {
  const query = `
    query GetAllRecipes {
      recipes {
        id
        customerCode
        Recipe
        active
        revision
      }
    }
  `;

  const { MES_USER, MES_PASSWORD } = process.env;

  if (!MES_USER || !MES_PASSWORD) {
    throw new Error("MES_USER and MES_PASSWORD environment variables must be defined");
  }

  const loginResult = await login(MES_USER, MES_PASSWORD);
  const jwtToken = loginResult;
  console.log(jwtToken);

  const graphqlEndpoint = process.env.NODE_ENV === 'production' ? 'http://10.4.8.25/graphql' : `http://localhost:${process.env.PORT}/graphql`;
  const response = await fetch(graphqlEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwtToken}`,
    },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();
  console.log(result); 
  return result.data.recipes;
};


const updateRecipe = async (recipeId: string) => {
  const query = `
    mutation UpdateRecipe {
      updateRecipe(
        data: { 
          updatedBy: "pmannion@whiskeyhouse.com"
        }
        where: { id: "${recipeId}" }
      ) {
        active
        createdAt
        createdBy
        customerCode
        globalId
        id
        Recipe
        revision
        schemaVersion
        updatedAt
        updatedBy
      }
    }
  `;
  const { MES_USER, MES_PASSWORD } = process.env;

  if (!MES_USER || !MES_PASSWORD) {
    throw new Error("MES_USER and MES_PASSWORD environment variables must be defined");
  }

  const loginResult = await login(MES_USER, MES_PASSWORD);
  const jwtToken = loginResult;
  console.log(jwtToken);
  
  const graphqlEndpoint = process.env.NODE_ENV === 'production' ? 'http://10.4.8.25/graphql' : `http://localhost:${process.env.PORT}/graphql`;
  const response = await fetch(graphqlEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwtToken}`,
    },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();
  if (result.errors && result.errors.length > 0) {
    console.error('Errors occurred while updating the recipe:', result.errors);
    // throw new Error('Errors occurred while updating the recipe');
  } else {
    console.log(result);
  }
};

const processAllRecipes = async () => {
  try {
    const recipes = await getAllRecipes();
    console.log(`Found ${recipes.length} recipes to update`);

    for (const recipe of recipes) {
      console.log(`Updating recipe ${recipe.id} (Customer: ${recipe.customerCode})`);
      await updateRecipe(recipe.id);
    }

    console.log('All recipes updated successfully');
  } catch (error) {
    console.error('Error processing recipes:', error);
  }
};

// You can now call either or both processes
processAllRecipes();