/**
 * API client for Schedule Order Grouping functionality
 * Handles the new Many:1 Production Order to Schedule Order workflow
 */

export interface ProductionOrderGroupingData {
  productionOrderIds: string[];
  recipeGroupId?: string;
  scheduleName?: string;
  estimatedStart?: string;
  estimatedEnd?: string;
  totalCooks?: number;
  totalFermenters?: number;
  plannedCooks?: number;
  plannedFermenters?: number;
  estimatedBarrelsPerFermenter?: number;
  estimatedPGsPerBbl?: number;
  estimatedPGsPerBushel?: number;
  totalGrainWeight?: number;
}

export interface GroupingCompatibilityResult {
  isCompatible: boolean;
  incompatibilityReasons: string[];
  warnings: string[];
}

export interface ProductionOrder {
  id: string;
  name: string;
  customer: {
    id: string;
    name: string;
  };
  recipe: {
    id: string;
    Recipe: string;
    recipeGroup: {
      id: string;
      recipe: string;
    };
  };
  containerType: string;
  finalProof: number;
  quantity: number;
  status: string;
  createdAt: string;
  scheduled: boolean;
}

export interface ScheduleOrder {
  id: string;
  name: string;
  recipeName: string;
  status: string;
  totalCooks?: number;
  totalFermenters?: number;
  executedCooks?: number;
  executedFermenters?: number;
  completedCooks?: number;
  completedFermenters?: number;
  estimatedStart?: string;
  estimatedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  recipeGroup: {
    id: string;
    recipe: string;
  };
  productionOrders: ProductionOrder[];
}

class ScheduleOrderGroupingAPI {
  private baseURL: string;

  constructor(baseURL: string = '/api') {
    this.baseURL = baseURL;
  }

  /**
   * Validates that a group of Production Orders can be grouped into a Schedule Order
   */
  async validateProductionOrderGrouping(productionOrderIds: string[]): Promise<GroupingCompatibilityResult> {
    const response = await fetch(`${this.baseURL}/schedule-order-grouping/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productionOrderIds }),
    });

    if (!response.ok) {
      throw new Error(`Failed to validate grouping: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Creates a Schedule Order from a group of Production Orders
   */
  async createScheduleOrderFromProductionOrders(data: ProductionOrderGroupingData): Promise<ScheduleOrder> {
    const response = await fetch(`${this.baseURL}/schedule-order-grouping/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to create schedule order: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Finds compatible Production Orders for grouping with a base order
   */
  async findCompatibleProductionOrders(
    baseProductionOrderId: string,
    limit: number = 10
  ): Promise<ProductionOrder[]> {
    const response = await fetch(
      `${this.baseURL}/schedule-order-grouping/compatible/${baseProductionOrderId}?limit=${limit}`
    );

    if (!response.ok) {
      throw new Error(`Failed to find compatible orders: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Gets available Production Orders that can be scheduled (not already in a Schedule Order)
   */
  async getAvailableProductionOrders(): Promise<ProductionOrder[]> {
    const response = await fetch(`${this.baseURL}/production-orders?scheduled=false&status=Initiated`);

    if (!response.ok) {
      throw new Error(`Failed to get available production orders: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Updates production execution tracking for a Schedule Order
   */
  async updateProductionExecution(
    scheduleOrderId: string,
    executionData: {
      executedCooks?: number;
      executedFermenters?: number;
      completedCooks?: number;
      completedFermenters?: number;
      actualStart?: string;
      actualEnd?: string;
    }
  ): Promise<ScheduleOrder> {
    const response = await fetch(
      `${this.baseURL}/schedule-orders/${scheduleOrderId}/execution`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(executionData),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to update production execution: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Records cook execution progress
   */
  async recordCookExecution(scheduleOrderId: string, cooksCompleted: number): Promise<ScheduleOrder> {
    const response = await fetch(
      `${this.baseURL}/schedule-orders/${scheduleOrderId}/cooks`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cooksCompleted }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to record cook execution: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Records fermenter execution progress
   */
  async recordFermenterExecution(scheduleOrderId: string, fermentersCompleted: number): Promise<ScheduleOrder> {
    const response = await fetch(
      `${this.baseURL}/schedule-orders/${scheduleOrderId}/fermenters`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fermentersCompleted }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to record fermenter execution: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Gets production execution status for a Schedule Order
   */
  async getProductionExecutionStatus(scheduleOrderId: string): Promise<{
    scheduleOrderId: string;
    totalCooks: number | null;
    executedCooks: number | null;
    completedCooks: number | null;
    totalFermenters: number | null;
    executedFermenters: number | null;
    completedFermenters: number | null;
    cookProgress: number;
    fermenterProgress: number;
    overallProgress: number;
    productionOrderCount: number;
  }> {
    const response = await fetch(`${this.baseURL}/schedule-orders/${scheduleOrderId}/execution-status`);

    if (!response.ok) {
      throw new Error(`Failed to get execution status: ${response.statusText}`);
    }

    return response.json();
  }
}

// Export singleton instance
export const scheduleOrderGroupingAPI = new ScheduleOrderGroupingAPI();

// Export hooks for React usage
export function useScheduleOrderGrouping() {
  return {
    validateGrouping: scheduleOrderGroupingAPI.validateProductionOrderGrouping.bind(scheduleOrderGroupingAPI),
    createScheduleOrder: scheduleOrderGroupingAPI.createScheduleOrderFromProductionOrders.bind(scheduleOrderGroupingAPI),
    findCompatible: scheduleOrderGroupingAPI.findCompatibleProductionOrders.bind(scheduleOrderGroupingAPI),
    getAvailable: scheduleOrderGroupingAPI.getAvailableProductionOrders.bind(scheduleOrderGroupingAPI),
    updateExecution: scheduleOrderGroupingAPI.updateProductionExecution.bind(scheduleOrderGroupingAPI),
    recordCooks: scheduleOrderGroupingAPI.recordCookExecution.bind(scheduleOrderGroupingAPI),
    recordFermenters: scheduleOrderGroupingAPI.recordFermenterExecution.bind(scheduleOrderGroupingAPI),
    getExecutionStatus: scheduleOrderGroupingAPI.getProductionExecutionStatus.bind(scheduleOrderGroupingAPI),
  };
}