import { formatDate, API_ENDPOINTS, QueryParams } from "@forge-mes/shared";

// Test the formatDate function
const today = new Date();
const formattedDate = formatDate(today, "yyyy-MM-dd HH:mm:ss");
console.log("Formatted date:", formattedDate);

// Test the API_ENDPOINTS constant
console.log("API Endpoints:", API_ENDPOINTS);

// Test the QueryParams interface
const queryParams: QueryParams = {
  pagination: {
    page: 1,
    limit: 10,
  },
  sort: {
    field: "createdAt",
    direction: "desc",
  },
  filters: [
    {
      field: "status",
      value: "active",
      operator: "eq",
    },
  ],
};

console.log("Query params:", queryParams);
