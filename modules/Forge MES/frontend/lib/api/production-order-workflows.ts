import { gql } from '@apollo/client';
import { unifiedGraphQLClient } from './unified-graphql-client';

// Types for comprehensive production order creation
export interface ProductionOrderWorkflowData {
  // Basic Production Order Data
  orderName: string;
  quantity: number;
  units: string;
  startDate: string;
  endDate: string;
  customerCode: string;
  priority: 'high' | 'medium' | 'low';
  notes?: string;
  finalProof?: number;
  containerType?: string;
  totalCooks?: number;
  totalFermenters?: number;
  totalGrainLoad?: number;
  upperControlLimit?: number | null;
  lowerControlLimit?: number | null;
  
  // Estimated values collected directly in wizard step 2
  estBblsPerFerm?: number;
  estPGsPerBbl?: number;
  estPGsPerBshl?: number;
  
  // Recipe and Customer Relations
  selectedRecipe: {
    id: string;
    Recipe: string;
    whiskeyType: string;
  };
  
  // BOM Items from wizard step 3
  bomItems: BOMItemData[];
  
  // Bin Configuration from wizard step 4
  binConfigurations?: BinConfigurationWorkflowData;
  
  // Schedule Order Data
  scheduleOrderData?: {
    estimatedStart?: string;
    estimatedEnd?: string;
    duration?: number;
    durationUnits?: string;
    totalBarrels?: number;
    totalProofGallons?: number;
  };
  
  // Workflow Options
  autoSchedule?: boolean;
}

export interface BOMItemData {
  id: string;
  itemCode: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  itemGroup?: string;
}

export interface BinConfigurationWorkflowData {
  sil110ConfigId?: string;
  sil115ConfigId?: string;
  sil120ConfigId?: string;
  totalCooks?: number;
  totalFermenters?: number;
  cooksPerFermenter?: number;
  entryProof?: number;
  proofGallonsPerBarrel?: number;
  barrelsPerFermenter?: number;
}

// Result types for workflow operations
export interface ProductionOrderResult {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  quantity: number;
  totalCooks?: number;
  totalFermenters?: number;
  upperControlLimit?: number;
  lowerControlLimit?: number;
  finalProof?: number;
  containerType?: string;
  createdBy: string;
  updatedBy: string;
  recipe: {
    id: string;
    Recipe: string;
    whiskeyType: string;
  };
  customer: {
    id: string;
    name?: string;
    customerCode: string;
  };
  bom: {
    id: string;
    bomName: string;
    bomRevision: string;
  };
  item: {
    id: string;
    itemNumber: string;
    itemName: string;
  };
}

export interface ScheduleOrderResult {
  id: string;
  name: string;
  status: string;
  estimatedStart: string;
  estimatedEnd: string;
  totalBarrels?: number;
  totalProofGallons?: number;
  duration?: number;
  durationUnits?: string;
  recipeName: string;
  createdBy: string;
  updatedBy: string;
}

export interface BOMItemResult {
  id: string;
  quantity: number;
  unit: string;
  operation: string;
  createdBy: string;
  updatedBy: string;
  item: {
    id: string;
    itemNumber: string;
    itemName: string;
    itemType: string;
    itemGroup?: string;
  };
  productionOrder: {
    id: string;
    name: string;
  };
}

export interface BinConfigurationResult {
  id: string;
  binType: string;
  configurationId: string;
  allocation: number;
  createdBy: string;
  updatedBy: string;
  productionOrder: {
    id: string;
    name: string;
  };
}

export interface ScheduleOrderQueueResult {
  id: string;
  queueIndex?: number;
  scheduleOrder: {
    id: string;
    name: string;
    status: string;
  };
}

export interface RecipeInstanceResult {
  id: string;
  createdAt: string;
  productionOrder: {
    id: string;
    name: string;
    status: string;
  };
  recipe: {
    id: string;
    Recipe: string;
    whiskeyType: string;
  };
}

export interface WorkflowResult {
  productionOrder: ProductionOrderResult;
  scheduleOrder: ScheduleOrderResult | null;  // null when autoSchedule is false
  bomItems: BOMItemResult[];
  binConfigurations: BinConfigurationResult[];
  scheduleOrderQueue: ScheduleOrderQueueResult | null;  // null when autoSchedule is false
  recipeInstance: RecipeInstanceResult;
}

// Comprehensive mutation that uses the backend createProductionOrderFromWizard
export const CREATE_PRODUCTION_ORDER_FROM_WIZARD = gql`
  mutation CreateProductionOrderFromWizard($data: CreateProductionOrderWizardInput!) {
    createProductionOrderFromWizard(data: $data) {
      id
      name
      quantity
      status
      startDate
      endDate
      customerCode
      finalProof
      containerType
      upperControlLimit
      lowerControlLimit
      createdAt
      updatedAt
      # Related entities - only request fields that actually exist
      item {
        id
        itemNumber
        itemName
        itemType
      }
      bom {
        id
        bomName
        bomRevision
        bomItem {
          id
          quantity
          units
          item {
            id
            itemNumber
            itemName
          }
        }
      }
      customer {
        id
        customerCode
      }
      recipe {
        id
        Recipe
        whiskeyType
      }
      scheduleOrder {
        id
        name
        status
        estimatedStart
        estimatedEnd
        totalBarrels
        totalProofGallons
        totalCooks
        totalFermenters
        duration
        durationUnits
      }
    }
  }
`;

// Main workflow class for production order creation
export class ProductionOrderWorkflow {
  private client = unifiedGraphQLClient;

  /**
   * Transform workflow data to wizard input format for the backend mutation
   */
  private transformToWizardInput(workflowData: ProductionOrderWorkflowData, userEmail: string) {
    console.log('🔍 Debug: Input workflowData:', {
      finalProof: workflowData.finalProof,
      estBblsPerFerm: workflowData.estBblsPerFerm,
      estPGsPerBbl: workflowData.estPGsPerBbl,
      estPGsPerBshl: workflowData.estPGsPerBshl,
      upperControlLimit: workflowData.upperControlLimit,
      lowerControlLimit: workflowData.lowerControlLimit,
      totalGrainLoad: workflowData.totalGrainLoad,
      units: workflowData.units
    });

    // Handle units field - pass through the unit ID from the wizard
    // The backend expects a valid unit ID, not a string like 'barrels'
    const units = workflowData.units;

    console.log('🔧 Using units value:', units);

    // Ensure required fields have valid defaults
    const finalProof = workflowData.finalProof || 120; // Default to 120 proof
    const containerType = workflowData.containerType || 'SmallBarrel'; // Default container type

    console.log('🔧 Applied defaults:', {
      units,
      finalProof,
      containerType,
      autoSchedule: workflowData.autoSchedule
    });

    const transformedData = {
      autoSchedule: workflowData.autoSchedule,
      productionOrder: {
        orderName: workflowData.orderName,
        quantity: Number(workflowData.quantity), // Ensure it's a number
        units: units, // Required field - now properly handled
        startDate: workflowData.startDate,
        endDate: workflowData.endDate,
        customerCode: workflowData.customerCode,
        priority: workflowData.priority,
        finalProof: Number(finalProof), // Required field, ensure it's a number
        containerType: containerType, // Required field with valid enum value
        // Map UI field names to backend field names
        cooks: workflowData.totalCooks ? Number(workflowData.totalCooks) : null,
        fermenters: workflowData.totalFermenters ? Number(workflowData.totalFermenters) : null,
        upperControlLimit: workflowData.upperControlLimit ? Number(workflowData.upperControlLimit) : null,
        lowerControlLimit: workflowData.lowerControlLimit ? Number(workflowData.lowerControlLimit) : null,
        // Fix: Get estimated values from workflow data directly, not from bin configurations
        estBblsPerFerm: workflowData.estBblsPerFerm ? Number(workflowData.estBblsPerFerm) : null,
        estPGsPerBbl: workflowData.estPGsPerBbl ? Number(workflowData.estPGsPerBbl) : null,
        estPGsPerBshl: workflowData.estPGsPerBshl ? Number(workflowData.estPGsPerBshl) : null,
        totalGrainLoad: workflowData.totalGrainLoad ? Number(workflowData.totalGrainLoad) : null
        // Note: removed 'notes' field as it doesn't exist in ProductionOrderWizardInput
      },
      recipe: {
        Recipe: workflowData.selectedRecipe.Recipe,
        id: workflowData.selectedRecipe.id,
        whiskeyType: workflowData.selectedRecipe.whiskeyType || null
      },
      bomItems: workflowData.bomItems.map(item => ({
        id: item.id,
        itemCode: item.itemCode,
        name: item.name,
        quantity: Number(item.quantity), // Ensure it's a number
        unit: item.unit,
        category: item.category || null,
        itemGroup: item.itemGroup || null
      })),
      binConfigurations: workflowData.binConfigurations ? {
        sil110ConfigId: workflowData.binConfigurations.sil110ConfigId || null,
        sil115ConfigId: workflowData.binConfigurations.sil115ConfigId || null,
        sil120ConfigId: workflowData.binConfigurations.sil120ConfigId || null,
        totalCooks: workflowData.binConfigurations.totalCooks ? Number(workflowData.binConfigurations.totalCooks) : null,
        totalFermenters: workflowData.binConfigurations.totalFermenters ? Number(workflowData.binConfigurations.totalFermenters) : null,
        cooksPerFermenter: workflowData.binConfigurations.cooksPerFermenter ? Number(workflowData.binConfigurations.cooksPerFermenter) : null,
        entryProof: workflowData.binConfigurations.entryProof ? Number(workflowData.binConfigurations.entryProof) : null,
        proofGallonsPerBarrel: workflowData.binConfigurations.proofGallonsPerBarrel ? Number(workflowData.binConfigurations.proofGallonsPerBarrel) : null,
        barrelsPerFermenter: workflowData.binConfigurations.barrelsPerFermenter ? Number(workflowData.binConfigurations.barrelsPerFermenter) : null
      } : null,
      scheduleOrder: workflowData.scheduleOrderData ? {
        estimatedStart: workflowData.scheduleOrderData.estimatedStart || workflowData.startDate,
        estimatedEnd: workflowData.scheduleOrderData.estimatedEnd || workflowData.endDate,
        duration: workflowData.scheduleOrderData.duration ? Number(workflowData.scheduleOrderData.duration) : null,
        durationUnits: workflowData.scheduleOrderData.durationUnits || null,
        totalBarrels: workflowData.scheduleOrderData.totalBarrels ? Number(workflowData.scheduleOrderData.totalBarrels) : null,
        totalProofGallons: workflowData.scheduleOrderData.totalProofGallons ? Number(workflowData.scheduleOrderData.totalProofGallons) : null,
      } : {
        // If no schedule order data provided, create minimal required data
        estimatedStart: workflowData.startDate,
        estimatedEnd: workflowData.endDate,
        duration: null,
        durationUnits: null,
        totalBarrels: null,
        totalProofGallons: null,
      },
      // Fix: MetadataWizardInput only has createdBy, source, and version fields
      metadata: {
        createdBy: userEmail,
        source: 'production-order-wizard',
        version: '1.0'
        // Note: removed 'updatedBy' and 'notes' fields as they don't exist in MetadataWizardInput
      }
    };

    console.log('📊 Final transformed data:', transformedData);
    return transformedData;
  }

  /**
   * Create a complete production order using the comprehensive backend mutation
   * This uses the createProductionOrderFromWizard backend mutation that handles everything
   */
  async createProductionOrderFromWizard(
    workflowData: ProductionOrderWorkflowData,
    userEmail: string
  ): Promise<WorkflowResult> {
    try {
      console.log('🔄 Creating production order using comprehensive backend mutation...', workflowData);
      
      // Transform workflow data to the backend mutation input format
      const wizardInput = this.transformToWizardInput(workflowData, userEmail);
      
      console.log('📊 Transformed wizard input:', wizardInput);
      
      // Debug: Check the GraphQL mutation before using it
      console.log('🔍 Debug: CREATE_PRODUCTION_ORDER_FROM_WIZARD type:', typeof CREATE_PRODUCTION_ORDER_FROM_WIZARD);
      console.log('🔍 Debug: CREATE_PRODUCTION_ORDER_FROM_WIZARD kind:', CREATE_PRODUCTION_ORDER_FROM_WIZARD?.kind);
      console.log('🔍 Debug: CREATE_PRODUCTION_ORDER_FROM_WIZARD definitions:', CREATE_PRODUCTION_ORDER_FROM_WIZARD?.definitions?.length);
      
      // Execute the comprehensive backend mutation
      const result = await this.client.mutate<{
        createProductionOrderFromWizard: {
          id: string;
          name: string;
          quantity: number;
          status: string;
          startDate: string;
          endDate: string;
          customerCode: string;
          finalProof: number;
          containerType: string;
          totalFermenters?: number;
          totalCooks?: number;
          upperControlLimit?: number;
          lowerControlLimit?: number;
          createdAt: string;
          updatedAt: string;
          item: {
            id: string;
            itemNumber: string;
            itemName: string;
            itemType: string;
          };
          bom: {
            id: string;
            bomName: string;
            bomRevision: string;
            bomItem: Array<{
              id: string;
              quantity: number;
              units: string;
              item: {
                id: string;
                itemNumber: string;
                itemName: string;
              };
            }>;
          };
          customer: {
            id: string;
            customerCode: string;
          };
          recipe: {
            id: string;
            Recipe: string;
            whiskeyType: string;
          };
          scheduleOrder: {
            id: string;
            name: string;
            status: string;
            estimatedStart: string;
            estimatedEnd: string;
            totalBarrels?: number;
            totalProofGallons?: number;
            duration?: number;
            durationUnits?: string;
          };
        };
      }>(CREATE_PRODUCTION_ORDER_FROM_WIZARD, {
        variables: {
          data: wizardInput
        }
      });
      
      if (!result?.createProductionOrderFromWizard) {
        throw new Error('Failed to create production order: No data returned from mutation');
      }
      
      const createdOrder = result.createProductionOrderFromWizard;
      console.log('✅ Production order created successfully with comprehensive backend:', createdOrder.id);
      
      // // Add null safety checks for all nested objects
      // if (!createdOrder.scheduleOrder) {
      //   throw new Error('Failed to create production order: Schedule order data is missing');
      // }
      
      if (!createdOrder.bom) {
        throw new Error('Failed to create production order: BOM data is missing');
      }
      
      if (!createdOrder.customer) {
        throw new Error('Failed to create production order: Customer data is missing');
      }
      
      if (!createdOrder.item) {
        throw new Error('Failed to create production order: Item data is missing');
      }
      
      if (!createdOrder.recipe) {
        throw new Error('Failed to create production order: Recipe data is missing');
      }
      
      return {
        productionOrder: {
          id: createdOrder.id,
          name: createdOrder.name,
          status: createdOrder.status,
          startDate: createdOrder.startDate,
          endDate: createdOrder.endDate,
          quantity: createdOrder.quantity,
          totalCooks: createdOrder.totalCooks ?? 0,
          totalFermenters: createdOrder.totalFermenters ?? 0,
          upperControlLimit: createdOrder.upperControlLimit ?? 0,
          lowerControlLimit: createdOrder.lowerControlLimit ?? 0,
          finalProof: createdOrder.finalProof,
          containerType: createdOrder.containerType,
          createdBy: userEmail,
          updatedBy: userEmail,
          recipe: createdOrder.recipe,
          customer: {
            id: createdOrder.customer.id,
            name: createdOrder.customer.customerCode,
            customerCode: createdOrder.customer.customerCode
          },
          bom: {
            id: createdOrder.bom.id,
            bomName: createdOrder.bom.bomName,
            bomRevision: createdOrder.bom.bomRevision
          },
          item: createdOrder.item
        },
        scheduleOrder: createdOrder.scheduleOrder ? {
          id: createdOrder.scheduleOrder.id,
          name: createdOrder.scheduleOrder.name,
          status: createdOrder.scheduleOrder.status,
          estimatedStart: createdOrder.scheduleOrder.estimatedStart,
          estimatedEnd: createdOrder.scheduleOrder.estimatedEnd,
          totalBarrels: createdOrder.scheduleOrder.totalBarrels ?? 0,
          totalProofGallons: createdOrder.scheduleOrder.totalProofGallons ?? 0,
          duration: createdOrder.scheduleOrder.duration ?? 0,
          durationUnits: createdOrder.scheduleOrder.durationUnits ?? 'days',
          recipeName: createdOrder.recipe.Recipe,
          createdBy: userEmail,
          updatedBy: userEmail
        } : null,
        bomItems: (createdOrder.bom.bomItem || []).map((bomItem: {
          id: string;
          quantity: number;
          units: string;
          item: {
            id: string;
            itemNumber: string;
            itemName: string;
          };
        }) => ({
          id: bomItem.id,
          quantity: bomItem.quantity,
          unit: bomItem.units,
          operation: 'Production',
          createdBy: userEmail,
          updatedBy: userEmail,
          item: {
            id: bomItem.item.id,
            itemNumber: bomItem.item.itemNumber,
            itemName: bomItem.item.itemName,
            itemType: 'Material',
            itemGroup: 'RM-GR' // Default item group for raw materials
          },
          productionOrder: {
            id: createdOrder.id,
            name: createdOrder.name
          }
        })),
        binConfigurations: [], // Will be populated when backend returns bin config data
        scheduleOrderQueue: createdOrder.scheduleOrder ? {
          id: `queue-${createdOrder.scheduleOrder.id}`,
          queueIndex: 1,
          scheduleOrder: {
            id: createdOrder.scheduleOrder.id,
            name: createdOrder.scheduleOrder.name,
            status: createdOrder.scheduleOrder.status
          }
        } : null,
        recipeInstance: {
          id: `instance-${createdOrder.id}`,
          createdAt: createdOrder.createdAt,
          productionOrder: {
            id: createdOrder.id,
            name: createdOrder.name,
            status: createdOrder.status
          },
          recipe: createdOrder.recipe
        }
      };
      
    } catch (error) {
      console.error('❌ Production order creation failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const productionOrderWorkflow = new ProductionOrderWorkflow();

// Helper function to transform wizard data to workflow data
export function transformWizardDataToWorkflowData(wizardData: Record<string, unknown>): ProductionOrderWorkflowData {
  // Validate required fields
  const selectedRecipe = wizardData['selectedRecipe'] as { id: string; name?: string; Recipe?: string; whiskeyType: string } | undefined
  if (!selectedRecipe?.id) {
    throw new Error('Selected recipe is required')
  }

  const bomItems = Array.isArray(wizardData['bomItems']) ? wizardData['bomItems'] as BOMItemData[] : []
  const binConfigurations = wizardData['binConfigurations'] as BinConfigurationWorkflowData | undefined

  // Helper function to safely convert number fields that might be empty strings
  const safeNumberConvert = (value: unknown): number | undefined => {
    if (typeof value === 'number') return value
    if (typeof value === 'string' && value !== '') {
      const parsed = Number(value)
      return isNaN(parsed) ? undefined : parsed
    }
    return undefined
  }

  // Helper function to safely convert number fields that can be null
  const safeNumberConvertNullable = (value: unknown): number | null => {
    if (typeof value === 'number') return value
    if (typeof value === 'string' && value !== '') {
      const parsed = Number(value)
      return isNaN(parsed) ? null : parsed
    }
    return null
  }

  // Extract and convert numeric fields safely
  const quantity = safeNumberConvert(wizardData['quantity']) || 0
  const finalProof = safeNumberConvert(wizardData['finalProof'])
  const totalGrainLoad = safeNumberConvert(wizardData['totalGrainLoad'])
  // Handle both 'cooks'/'fermenters' (UI field names) and 'totalCooks'/'totalFermenters' (backend field names)
  const cooks = safeNumberConvert(wizardData['cooks']) || safeNumberConvert(wizardData['totalCooks'])
  const fermenters = safeNumberConvert(wizardData['fermenters']) || safeNumberConvert(wizardData['totalFermenters'])
  const upperControlLimit = safeNumberConvertNullable(wizardData['upperControlLimit'])
  const lowerControlLimit = safeNumberConvertNullable(wizardData['lowerControlLimit'])
  const estBblsPerFerm = safeNumberConvert(wizardData['estBblsPerFerm'])
  const estPGsPerBbl = safeNumberConvert(wizardData['estPGsPerBbl'])
  const estPGsPerBshl = safeNumberConvert(wizardData['estPGsPerBshl'])

  // Provide default bin configurations if not provided
  const defaultBinConfigurations: BinConfigurationWorkflowData = {
    sil110ConfigId: '',
    sil115ConfigId: '',
    sil120ConfigId: '',
    totalCooks: cooks || 0,
    totalFermenters: fermenters || 0,
    cooksPerFermenter: 0,
    entryProof: finalProof || 0,
    proofGallonsPerBarrel: estPGsPerBbl || 0,
    barrelsPerFermenter: estBblsPerFerm || 0
  }

  // Calculate derived values for schedule order data
  const totalBarrels = estBblsPerFerm && fermenters ? estBblsPerFerm * fermenters : quantity
  const totalProofGallons = estPGsPerBbl && totalBarrels ? estPGsPerBbl * totalBarrels : totalBarrels * 53

  const baseData = {
    orderName: String(wizardData['orderName'] || ''),
    quantity: quantity,
    units: String(wizardData['units'] || ''),
    startDate: String(wizardData['startDate'] || ''),
    endDate: String(wizardData['endDate'] || ''),
    customerCode: String(wizardData['customerCode'] || ''),
    priority: (wizardData['priority'] as 'high' | 'medium' | 'low') || 'medium',
    selectedRecipe: {
      id: selectedRecipe.id,
      Recipe: selectedRecipe.Recipe || selectedRecipe.name || '',
      whiskeyType: selectedRecipe.whiskeyType
    },
    bomItems: bomItems,
    binConfigurations: binConfigurations || defaultBinConfigurations,
    scheduleOrderData: {
      estimatedStart: String(wizardData['startDate'] || ''),
      estimatedEnd: String(wizardData['endDate'] || ''),
      durationUnits: String(wizardData['units'] || 'days'),
      totalBarrels: totalBarrels,
      totalProofGallons: totalProofGallons
    }
  }

  // Add optional properties only if they exist and are not undefined
  const result: ProductionOrderWorkflowData = { ...baseData }
  
  if (wizardData['notes'] && typeof wizardData['notes'] === 'string') {
    result.notes = wizardData['notes']
  }
  
  if (finalProof !== undefined) {
    result.finalProof = finalProof
  }
  
  if (wizardData['containerType'] && typeof wizardData['containerType'] === 'string') {
    result.containerType = wizardData['containerType']
  }
  
  if (cooks !== undefined) {
    result.totalCooks = cooks
  }
  
  if (fermenters !== undefined) {
    result.totalFermenters = fermenters
  }
  
  if (upperControlLimit !== null) {
    result.upperControlLimit = upperControlLimit
  }
  
  if (lowerControlLimit !== null) {
    result.lowerControlLimit = lowerControlLimit
  }

  if (totalGrainLoad !== undefined) {
    result.totalGrainLoad = totalGrainLoad
  }

  // Add estimated values from wizard step 2
  if (estBblsPerFerm !== undefined) {
    result.estBblsPerFerm = estBblsPerFerm
  }

  if (estPGsPerBbl !== undefined) {
    result.estPGsPerBbl = estPGsPerBbl
  }

  if (estPGsPerBshl !== undefined) {
    result.estPGsPerBshl = estPGsPerBshl
  }

  // Add autoSchedule option
  if (wizardData['autoSchedule'] !== undefined) {
    result.autoSchedule = wizardData['autoSchedule'] as boolean
  }

  return result
} 