import { gql } from "@apollo/client";

/**
 * GraphQL queries and mutations for BOM consumption tracking
 * Updated to match actual backend schema - using correct field names
 */

// Type definitions matching backend GraphQL types
export interface SORecipeItemType {
  id: string;
  itemName?: string;
  itemCode?: string;
  itemNumber?: string;
}

export interface SORecipeUnitsType {
  id: string;
  name?: string;
  abbreviation?: string;
}

export interface SORecipeBomItemType {
  id: string;
  quantity?: number;
  item?: SORecipeItemType;
  displayUnits?: SORecipeUnitsType;
}

export interface SORecipeBomType {
  id: string;
  recipeBomITem: SORecipeBomItemType[];
}

export interface SOScheduleOrderInfoType {
  id: string;
  status?: string;
  scheduleOrderNumber?: string;
}

export interface SORecipeInfoType {
  id: string;
  name?: string;
  revision?: number;
}

export interface SORecipeInstanceWithComponentsType {
  id: string;
  status: string;
  scheduleOrder?: SOScheduleOrderInfoType;
  recipe?: SORecipeInfoType;
  recipeBoms: SORecipeBomType[];
}

export interface ScheduleOrderQueueItem {
  id: string;
  queueIndex?: number;
  areas?: {
    id: string;
    name?: string;
  }[];
  scheduleOrder?: {
    id: string;
    name?: string;
    status?: string;
    estimatedStart?: string;
    estimatedEnd?: string;
    productionOrders?: {
      id: string;
      name?: string;
      customer?: {
        id: string;
        name?: string;
      };
    }[];
    scheduleOrderRecipe?: {
      id: string;
      status: string;
    };
  };
}

// Query to get schedule order queue items with full details
// Only show in-progress orders (queue index <= 0)
export const GET_ACTIVE_SCHEDULE_ORDERS = gql`
  query GetActiveScheduleOrderQueue {
    scheduleOrderQueues(
      where: { queueIndex: { lte: 0 } }
      orderBy: { queueIndex: Asc }
    ) {
      id
      queueIndex
      areas {
        id
        name
      }
      scheduleOrder {
        id
        name
        status
        estimatedStart
        estimatedEnd
        productionOrders {
          id
          name
          customer {
            id
            name
          }
        }
        scheduleOrderRecipe {
          id
        }
      }
    }
  }
`;

// Query to get schedule order recipe instance with full BOM details
export const GET_SCHEDULE_ORDER_RECIPE_COMPONENTS = gql`
  query GetScheduleOrderRecipeComponents($scheduleOrderId: String!) {
    scheduleOrderRecipeInstanceWithComponents(
      scheduleOrderId: $scheduleOrderId
    ) {
      id
      status
      scheduleOrder {
        id
        scheduleOrderNumber
        status
      }
      recipe {
        id
        name
        revision
      }
      recipeBoms {
        id
        recipeBomITem {
          id
          quantity
          item {
            id
            itemName
            itemCode
            itemNumber
          }
          displayUnits {
            id
            name
            abbreviation
          }
        }
      }
    }
  }
`;

// Mutation to create a BOM consumption record
export const CREATE_RECIPE_BOM_ACTUAL = gql`
  mutation CreateRecipeBomActual($data: RecipeBomActualCreateInput!) {
    createRecipeBomActual(data: $data) {
      id
      quantityPlanned
      quantityActual
      lotNumber
      inventoryId
      consumedAt
      createdBy
      createdAt
    }
  }
`;

// Query to get BOM actuals for a specific BOM item
export const GET_RECIPE_BOM_ACTUALS = gql`
  query GetRecipeBomActuals($where: RecipeBomActualWhereInput!) {
    recipeBomActuals(where: $where) {
      id
      quantityPlanned
      quantityActual
      lotNumber
      inventoryId
      consumedAt
      createdBy
      createdAt
      updatedAt
    }
  }
`;
