import { gql } from '@apollo/client';

// GraphQL Mutations
export const UPDATE_PRODUCTION_ORDER = gql`
  mutation UpdateProductionOrder($data: ProductionOrderUpdateInput!, $where: ProductionOrderWhereUniqueInput!) {
    updateProductionOrder(data: $data, where: $where) {
      id
      status
      quantity
      startDate
      endDate
      completedQuantity
      customerCode
      finalProof
      containerType
      complete
      inProcess
      scheduled
      updatedAt
      updatedBy
      customer {
        id
        name
        customerCode
      }
      recipe {
        id
        Recipe
      }
      bom {
        id
        bomName
        bomRevision
      }
    }
  }
`;

export const UPDATE_SCHEDULE_ORDER = gql`
  mutation UpdateScheduleOrder($data: ScheduleOrderUpdateInput!, $where: ScheduleOrderWhereUniqueInput!) {
    updateScheduleOrder(data: $data, where: $where) {
      id
      status
      estimatedStart
      estimatedEnd
      actualStart
      actualEnd
      duration
      durationUnits
      estimatedMashingStartTime
      estimatedMashingDuration
      estimatedFermentationStartTime
      estimatedFermentationDuration
      estimatedDistillationStartTime
      estimatedDistillationDuration
      estimatedBarrelingStartTime
      estimatedProcessingStartTime
      estimatedTotalProductionDuration
      totalBarrels
      totalProofGallons
      productionOrderAllocation
      recipeName
      updatedAt
      updatedBy
      recipeGroup {
        id
        recipe
      }
      scheduleOrderRecipe {
        id
        Recipe
      }
    }
  }
`;

export const CREATE_PRODUCTION_ORDER_RECIPE_INSTANCE = gql`
  mutation CreateProductionOrderRecipeInstanceFromScheduleQueue($scheduleOrderQueueId: String!, $createdBy: String!) {
    createProductionOrderRecipeInstanceFromScheduleQueue(
      scheduleOrderQueueId: $scheduleOrderQueueId
      createdBy: $createdBy
    ) {
      id
      createdAt
      productionOrder {
        id
        status
        quantity
      }
      recipe {
        id
        Recipe
      }
    }
  }
`;

// TypeScript Types
export interface ProductionOrderUpdateData {
  status?: 'Committed' | 'Complete' | 'InProgress' | 'Initiated' | 'Planned';
  quantity?: number;
  startDate?: string;
  endDate?: string;
  completedQuantity?: number;
  finalProof?: number;
  containerType?: 'BulkLoadout' | 'IbcTote275' | 'LargeBarrel' | 'PlasticDrum' | 'SmallBarrel' | 'SsTote275';
  complete?: boolean;
  inProcess?: boolean;
  scheduled?: boolean;
  updatedBy?: string;
  customerCode?: string;
  // Relationship updates
  customer?: { id: string };
  recipe?: { id: string };
  bom?: { id: string };
  // Note: Execution tracking fields (totalCooks, completedCooks, etc.) moved to ScheduleOrder
}

export interface ScheduleOrderUpdateData {
  status?: 'Complete' | 'Created' | 'InProgress' | 'Scheduled';
  estimatedStart?: string;
  estimatedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  duration?: number;
  durationUnits?: string;
  estimatedMashingStartTime?: string;
  estimatedMashingDuration?: number;
  estimatedFermentationStartTime?: string;
  estimatedFermentationDuration?: number;
  estimatedDistillationStartTime?: string;
  estimatedDistillationDuration?: number;
  estimatedBarrelingStartTime?: string;
  estimatedProcessingStartTime?: string;
  estimatedTotalProductionDuration?: number;
  totalBarrels?: number;
  totalProofGallons?: number;
  productionOrderAllocation?: Record<string, unknown>; // JSON field
  recipeName?: string;
  name?: string;
  globalId?: string;
  createdBy?: string;
  updatedBy?: string;
  // Relationship updates
  recipeGroup?: { id: string };
  scheduleOrderRecipe?: { id: string };
  scheduleOrderQueues?: { id: string };
}

// Helper Functions
export const formatDateForGraphQL = (date: Date | string): string => {
  if (typeof date === 'string') {
    return new Date(date).toISOString();
  }
  return date.toISOString();
};

export const validateProductionOrderUpdate = (data: ProductionOrderUpdateData): string[] => {
  const errors: string[] = [];

  // Validation for ProductionOrder fields only
  // Note: Execution tracking validation (cooks, fermenters) now belongs to ScheduleOrder
  
  if (data.completedQuantity !== undefined && data.quantity !== undefined) {
    if (data.completedQuantity > data.quantity) {
      errors.push('Completed quantity cannot exceed total quantity');
    }
  }
  
  if (data.startDate && data.endDate) {
    if (new Date(data.startDate) > new Date(data.endDate)) {
      errors.push('Start date cannot be after end date');
    }
  }
  
  return errors;
};

export const validateScheduleOrderUpdate = (data: ScheduleOrderUpdateData): string[] => {
  const errors: string[] = [];
  
  if (data.estimatedStart && data.estimatedEnd) {
    if (new Date(data.estimatedStart) > new Date(data.estimatedEnd)) {
      errors.push('Estimated start cannot be after estimated end');
    }
  }
  
  if (data.actualStart && data.actualEnd) {
    if (new Date(data.actualStart) > new Date(data.actualEnd)) {
      errors.push('Actual start cannot be after actual end');
    }
  }
  
  if (data.totalBarrels !== undefined && data.totalBarrels < 0) {
    errors.push('Total barrels cannot be negative');
  }
  
  if (data.totalProofGallons !== undefined && data.totalProofGallons < 0) {
    errors.push('Total proof gallons cannot be negative');
  }
  
  return errors;
}; 