import fetch from "node-fetch";
import * as dotenv from "dotenv";
import path from "path";

// Update the path to be relative to the current file
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Add validation for required environment variables
const requiredEnvVars = ["MES_USER", "MES_PASSWORD", "NODE_ENV"];
const missingEnvVars = requiredEnvVars.filter(
  (varName) => !process.env[varName]
);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`
  );
}

const login = async (username: string, password: string) => {
  const apiEndpoint =
    process.env.NODE_ENV === "production"
      ? "http://10.4.8.25/api/auth/login"
      : `http://localhost:${process.env.PORT}/api/login`;
  const response = await fetch(apiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.statusText}`);
  }

  const result = await response.json();

  console.log(result);
  return result["accessToken"];
};

const getAllCustomers = async () => {
  const query = `
    query GetAllCustomers {
      customers {
        id
        customerCode
      }
    }
  `;

  const { MES_USER, MES_PASSWORD } = process.env;

  if (!MES_USER || !MES_PASSWORD) {
    throw new Error(
      "MES_USER and MES_PASSWORD environment variables must be defined"
    );
  }

  const loginResult = await login(MES_USER, MES_PASSWORD);
  const jwtToken = loginResult;
  console.log(jwtToken);

  const graphqlEndpoint =
    process.env.NODE_ENV === "production"
      ? "http://10.4.8.25/graphql"
      : `http://localhost:${process.env.PORT}/graphql`;
  const response = await fetch(graphqlEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwtToken}`,
    },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();
  console.log("Customers: ");
  console.log(result);
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

  const { MES_USER, MES_PASSWORD } = process.env;

  if (!MES_USER || !MES_PASSWORD) {
    throw new Error(
      "MES_USER and MES_PASSWORD environment variables must be defined"
    );
  }

  const loginResult = await login(MES_USER, MES_PASSWORD);
  const jwtToken = loginResult;
  console.log(jwtToken);

  const graphqlEndpoint =
    process.env.NODE_ENV === "production"
      ? "http://10.4.8.25/graphql"
      : `http://localhost:${process.env.PORT}/graphql`;
  const response = await fetch(graphqlEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwtToken}`,
    },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();
  console.log(result.data.customers);
  console.log(result);
};

const processAllCustomers = async () => {
  try {
    const customers = await getAllCustomers();
    console.log(`Found ${customers.length} customers to update`);

    for (const customer of customers) {
      console.log(
        `Updating customer ${customer.customerCode} (${customer.id})`
      );
      await updateCustomer(customer.id, customer.customerCode);
    }

    console.log("All customers updated successfully");
  } catch (error) {
    console.error("Error processing customers:", error);
  }
};

// You can now call either or both processes
processAllCustomers();
