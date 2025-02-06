import fetch from 'node-fetch';

const getAllCustomers = async () => {
  const query = `
    query GetAllCustomers {
      customers {
        id
        customerCode
      }
    }
  `;

  const response = await fetch('http://your-graphql-endpoint.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();
  return result.data.customers;
};

const updateCustomer = async (customerId: string, customerCode: string) => {
  const query = `
    mutation UpdateCustomer {
      updateCustomer(
        data: { createdBy: "ERP", customerCode: "${customerCode}" }
        where: { id: "${customerId}" }
      ) {
        customerCode
        id
      }
    }
  `;

  const response = await fetch('http://your-graphql-endpoint.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();
  console.log(result);
};

const processAllCustomers = async () => {
  try {
    const customers = await getAllCustomers();
    console.log(`Found ${customers.length} customers to update`);

    for (const customer of customers) {
      console.log(`Updating customer ${customer.customerCode} (${customer.id})`);
      await updateCustomer(customer.id, customer.customerCode);
    }

    console.log('All customers updated successfully');
  } catch (error) {
    console.error('Error processing customers:', error);
  }
};

const getAllRecipes = async () => {
  const query = `
    query GetAllRecipes {
      recipes {
        id
        customerCode
        recipe
        active
        revision
      }
    }
  `;

  const response = await fetch('http://your-graphql-endpoint.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();
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
        erpId
        globalId
        id
        recipe
        revision
        schemaVersion
        transactionInitiator
        transactionStatus
        transactionType
        updatedAt
        updatedBy
      }
    }
  `;

  const response = await fetch('http://your-graphql-endpoint.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();
  console.log(result);
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
processAllCustomers();
processAllRecipes();