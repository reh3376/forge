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

  const graphqlEndpoint = process.env.NODE_ENV === 'production' ? 'http://10.4.8.25/graphql' : 'http://localhost/graphql';
  const response = await fetch(graphqlEndpoint, {
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

  const graphqlEndpoint = process.env.NODE_ENV === 'production' ? 'http://10.4.8.25/graphql' : 'http://localhost/graphql';
  const response = await fetch(graphqlEndpoint, {
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

// You can now call either or both processes
processAllCustomers();