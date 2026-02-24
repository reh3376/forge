import { gql } from '@apollo/client';
import { unifiedGraphQLClient } from '@/lib/api/unified-graphql-client';

// GraphQL Mutations
export const CREATE_MASTER_RECIPE = gql`
  mutation CreateMasterRecipe($input: CreateMasterRecipeInput!) {
    createMasterRecipe(input: $input) {
      Recipe
      id
      active
      createdAt
      createdBy
      revision
      whiskeyType
      updatedAt
      updatedBy
      cooksPerFerm
      customerCode
      mashBill {
        corn
        wheat
        maltedBarley
        rye
      }
      ingredients {
        id
        itemCode
        name
        category
        quantity
        unit
        notes
      }
      mashingSteps {
        id
        index
        stepType
        included
        timeDuration
        heatTempSp
        coolTempSp
        holdType
        notes
      }
      parameters {
        name
        value
        unit
        description
      }
    }
  }
`;

export const UPDATE_MASTER_RECIPE = gql`
  mutation UpdateMasterRecipe($id: String!, $input: UpdateMasterRecipeInput!) {
    updateMasterRecipe(id: $id, input: $input) {
      Recipe
      id
      active
      createdAt
      createdBy
      revision
      whiskeyType
      updatedAt
      updatedBy
      cooksPerFerm
      customerCode
      mashBill {
        corn
        wheat
        maltedBarley
        rye
      }
      ingredients {
        id
        itemCode
        name
        category
        quantity
        unit
        notes
      }
      mashingSteps {
        id
        index
        stepType
        included
        timeDuration
        heatTempSp
        coolTempSp
        holdType
        notes
      }
      parameters {
        name
        value
        unit
        description
      }
    }
  }
`;

export const CREATE_MASTER_RECIPE_FROM_WIZARD = gql`
  mutation CreateMasterRecipeFromWizard($wizardData: WizardDataInput!) {
    createMasterRecipeFromWizard(wizardData: $wizardData) {
      Recipe
      id
      active
      createdAt
      createdBy
      revision
      whiskeyType
      updatedAt
      updatedBy
      cooksPerFerm
      customerCode
      mashBill {
        corn
        wheat
        maltedBarley
        rye
      }
      ingredients {
        id
        itemCode
        name
        category
        quantity
        unit
        notes
      }
      mashingSteps {
        id
        index
        stepType
        included
        timeDuration
        heatTempSp
        coolTempSp
        holdType
        notes
      }
      parameters {
        name
        value
        unit
        description
      }
    }
  }
`;

export const UPDATE_MASTER_RECIPE_FROM_WIZARD = gql`
  mutation UpdateMasterRecipeFromWizard($id: String!, $wizardData: WizardDataInput!) {
    updateMasterRecipeFromWizard(id: $id, wizardData: $wizardData) {
      Recipe
      id
      active
      createdAt
      createdBy
      revision
      whiskeyType
      updatedAt
      updatedBy
      cooksPerFerm
      customerCode
      mashBill {
        corn
        wheat
        maltedBarley
        rye
      }
      ingredients {
        id
        itemCode
        name
        category
        quantity
        unit
        notes
      }
      mashingSteps {
        id
        index
        stepType
        included
        timeDuration
        heatTempSp
        coolTempSp
        holdType
        notes
      }
      parameters {
        name
        value
        unit
        description
      }
    }
  }
`;

// Type definitions for better TypeScript support
export interface MashBillComposition {
  corn: number;
  wheat: number;
  maltedBarley: number;
  rye: number;
}

export interface RecipeIngredient {
  id: string;
  itemCode: string;
  name: string;
  category: 'grains' | 'enzymes' | 'yeast' | 'water' | 'other';
  quantity: number;
  unit: string;
  notes?: string;
}

export interface MashingStep {
  id: string;
  index: number;
  stepType: 'AdditiveAdd' | 'Corn' | 'Hold' | 'LiquidAdd' | 'Malt' | 'PreMalt' | 'Prompt' | 'Rye' | 'Wheat';
  included: boolean;
  timeDuration: number;
  heatTempSp?: number;
  coolTempSp?: number;
  holdType: 'Heat' | 'Cool' | 'Hold';
  notes?: string;
}

export interface RecipeParameter {
  name: string;
  value: number;
  unit: string;
  description?: string;
}

export interface CreateMasterRecipeInput {
  Recipe: string;
  active: boolean;
  cooksPerFerm: number;
  createdBy: string;
  customerCode: string;
  whiskeyType: 'FourGrainBourbon' | 'RyeWhiskey' | 'WheatWhiskey' | 'CornWhiskey' | 'MaltWhiskey';
  revision: string;
  mashBill: MashBillComposition;
  ingredients: RecipeIngredient[];
  mashingSteps: MashingStep[];
  parameters: RecipeParameter[];
}

export interface UpdateMasterRecipeInput {
  Recipe?: string;
  active?: boolean;
  cooksPerFerm?: number;
  customerCode?: string;
  whiskeyType?: 'FourGrainBourbon' | 'RyeWhiskey' | 'WheatWhiskey' | 'CornWhiskey' | 'MaltWhiskey';
  updatedBy?: string;
  mashBill?: MashBillComposition;
  ingredients?: RecipeIngredient[];
  mashingSteps?: MashingStep[];
  parameters?: RecipeParameter[];
}

export interface MasterRecipeResponse {
  Recipe: string;
  id: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
  revision: string;
  whiskeyType: string;
  updatedAt?: string;
  updatedBy?: string;
  cooksPerFerm: number;
  customerCode: string;
  mashBill: MashBillComposition;
  ingredients: RecipeIngredient[];
  mashingSteps: MashingStep[];
  parameters: RecipeParameter[];
}

export interface WizardData {
  recipeName?: string;
  active?: boolean;
  cooksPerFerm?: number;
  createdBy?: string;
  customerCode?: string;
  whiskeyType?: 'FourGrainBourbon' | 'RyeWhiskey' | 'WheatWhiskey' | 'CornWhiskey' | 'MaltWhiskey';
  revision?: string;
  mashBill?: MashBillComposition;
  ingredients?: RecipeIngredient[];
  mashingSteps?: MashingStep[];
  parameters?: RecipeParameter[];
}

// Utility functions for recipe wizard
export const validateMashBill = (mashBill: MashBillComposition): boolean => {
  const total = mashBill.corn + mashBill.wheat + mashBill.maltedBarley + mashBill.rye;
  return Math.abs(total - 100) < 0.01; // Allow for small floating point errors
};

export const generateRecipeCode = (
  whiskeyType: string,
  mashBill: MashBillComposition,
  revision: string = 'R01'
): string => {
  const typeCode = whiskeyType.substring(0, 3).toUpperCase();
  const corn = Math.round(mashBill.corn).toString().padStart(2, '0');
  const wheat = Math.round(mashBill.wheat).toString().padStart(2, '0');
  const rye = Math.round(mashBill.rye).toString().padStart(2, '0');
  const malt = Math.round(mashBill.maltedBarley).toString().padStart(2, '0');
  
  return `${typeCode}-${corn}-${wheat}-${rye}-${malt}-${revision}`;
};

export const calculateIngredientQuantities = (
  mashBill: MashBillComposition,
  totalBatchSize: number = 2000 // pounds
): Partial<Record<keyof MashBillComposition, number>> => {
  return {
    corn: (mashBill.corn / 100) * totalBatchSize,
    wheat: (mashBill.wheat / 100) * totalBatchSize,
    maltedBarley: (mashBill.maltedBarley / 100) * totalBatchSize,
    rye: (mashBill.rye / 100) * totalBatchSize,
  };
};

export const getDefaultMashingSteps = (mashBill: MashBillComposition): MashingStep[] => {
  const steps: MashingStep[] = [];
  let stepIndex = 1;

  // Corn step (if corn > 0)
  if (mashBill.corn > 0) {
    steps.push({
      id: `step-${stepIndex.toString().padStart(3, '0')}`,
      index: stepIndex++,
      stepType: 'Corn',
      included: true,
      timeDuration: 30,
      heatTempSp: 180,
      holdType: 'Heat',
      notes: 'Initial corn mash'
    });
  }

  // Hold step
  steps.push({
    id: `step-${stepIndex.toString().padStart(3, '0')}`,
    index: stepIndex++,
    stepType: 'Hold',
    included: true,
    timeDuration: 60,
    heatTempSp: 180,
    holdType: 'Hold',
    notes: 'Hold at temperature'
  });

  // Rye step (if rye > 0)
  if (mashBill.rye > 0) {
    steps.push({
      id: `step-${stepIndex.toString().padStart(3, '0')}`,
      index: stepIndex++,
      stepType: 'Rye',
      included: true,
      timeDuration: 15,
      coolTempSp: 155,
      holdType: 'Cool',
      notes: 'Add rye grain'
    });
  }

  // Wheat step (if wheat > 0)
  if (mashBill.wheat > 0) {
    steps.push({
      id: `step-${stepIndex.toString().padStart(3, '0')}`,
      index: stepIndex++,
      stepType: 'Wheat',
      included: true,
      timeDuration: 15,
      coolTempSp: 150,
      holdType: 'Cool',
      notes: 'Add wheat grain'
    });
  }

  // Malt step (always included for enzyme conversion)
  steps.push({
    id: `step-${stepIndex.toString().padStart(3, '0')}`,
    index: stepIndex++,
    stepType: 'Malt',
    included: true,
    timeDuration: 20,
    coolTempSp: 148,
    holdType: 'Cool',
    notes: 'Add malted barley for conversion'
  });

  return steps;
};

export const getDefaultParameters = (): RecipeParameter[] => {
  return [
    {
      name: 'Fermentation Temperature',
      value: 85,
      unit: '°F',
      description: 'Target fermentation temperature'
    },
    {
      name: 'Fermentation Time',
      value: 96,
      unit: 'hours',
      description: 'Total fermentation duration'
    },
    {
      name: 'Final Proof',
      value: 125,
      unit: 'proof',
      description: 'Target distillation proof'
    }
  ];
};

export const createRecipeFromWizardData = (wizardData: WizardData): CreateMasterRecipeInput => {
  const mashBill: MashBillComposition = {
    corn: wizardData.mashBill?.corn || 0,
    wheat: wizardData.mashBill?.wheat || 0,
    maltedBarley: wizardData.mashBill?.maltedBarley || 0,
    rye: wizardData.mashBill?.rye || 0,
  };

  const whiskeyType: 'FourGrainBourbon' | 'RyeWhiskey' | 'WheatWhiskey' | 'CornWhiskey' | 'MaltWhiskey' = 
    wizardData.whiskeyType || 'FourGrainBourbon';
  const revision: string = wizardData.revision || 'R01';
  
  const recipeCode = generateRecipeCode(
    whiskeyType,
    mashBill,
    revision
  );

  return {
    Recipe: wizardData.recipeName || recipeCode,
    active: wizardData.active ?? true,
    cooksPerFerm: wizardData.cooksPerFerm || 3,
    createdBy: wizardData.createdBy || 'recipe_wizard',
    customerCode: wizardData.customerCode || recipeCode.split('-')[0],
    whiskeyType,
    revision,
    mashBill,
    ingredients: wizardData.ingredients || [],
    mashingSteps: wizardData.mashingSteps || getDefaultMashingSteps(mashBill),
    parameters: wizardData.parameters || getDefaultParameters(),
  };
};

/**
 * Master Recipe Service Class
 * Uses the unified GraphQL client for all master recipe operations
 */
export class MasterRecipeService {
  /**
   * Create a new master recipe
   */
  async createMasterRecipe(input: CreateMasterRecipeInput): Promise<MasterRecipeResponse> {
    try {
      console.log('🍺 Creating master recipe:', input.Recipe);
      
      const result = await unifiedGraphQLClient.mutate<{ createMasterRecipe: MasterRecipeResponse }>(
        CREATE_MASTER_RECIPE,
        {
          variables: { input },
        }
      );

      if (!result.createMasterRecipe) {
        throw new Error('Failed to create master recipe - no data returned');
      }

      console.log('✅ Master recipe created successfully:', result.createMasterRecipe.id);
      return result.createMasterRecipe;
    } catch (error) {
      console.error('❌ Error creating master recipe:', error);
      throw error;
    }
  }

  /**
   * Update an existing master recipe
   */
  async updateMasterRecipe(id: string, input: UpdateMasterRecipeInput): Promise<MasterRecipeResponse> {
    try {
      console.log('🍺 Updating master recipe:', id);
      
      const result = await unifiedGraphQLClient.mutate<{ updateMasterRecipe: MasterRecipeResponse }>(
        UPDATE_MASTER_RECIPE,
        {
          variables: { id, input },
        }
      );

      if (!result.updateMasterRecipe) {
        throw new Error('Failed to update master recipe - no data returned');
      }

      console.log('✅ Master recipe updated successfully:', result.updateMasterRecipe.id);
      return result.updateMasterRecipe;
    } catch (error) {
      console.error('❌ Error updating master recipe:', error);
      throw error;
    }
  }

  /**
   * Create a master recipe from wizard data
   */
  async createMasterRecipeFromWizard(wizardData: WizardData): Promise<MasterRecipeResponse> {
    try {
      console.log('🧙‍♂️ Creating master recipe from wizard data');
      
      // Convert wizard data to proper input format
      const input = createRecipeFromWizardData(wizardData);
      
      const result = await unifiedGraphQLClient.mutate<{ createMasterRecipeFromWizard: MasterRecipeResponse }>(
        CREATE_MASTER_RECIPE_FROM_WIZARD,
        {
          variables: { wizardData: input },
        }
      );

      if (!result.createMasterRecipeFromWizard) {
        throw new Error('Failed to create master recipe from wizard - no data returned');
      }

      console.log('✅ Master recipe created from wizard successfully:', result.createMasterRecipeFromWizard.id);
      return result.createMasterRecipeFromWizard;
    } catch (error) {
      console.error('❌ Error creating master recipe from wizard:', error);
      throw error;
    }
  }

  /**
   * Update a master recipe from wizard data
   */
  async updateMasterRecipeFromWizard(id: string, wizardData: WizardData): Promise<MasterRecipeResponse> {
    try {
      console.log('🧙‍♂️ Updating master recipe from wizard data:', id);
      
      // Convert wizard data to proper input format
      const input = createRecipeFromWizardData(wizardData);
      
      const result = await unifiedGraphQLClient.mutate<{ updateMasterRecipeFromWizard: MasterRecipeResponse }>(
        UPDATE_MASTER_RECIPE_FROM_WIZARD,
        {
          variables: { id, wizardData: input },
        }
      );

      if (!result.updateMasterRecipeFromWizard) {
        throw new Error('Failed to update master recipe from wizard - no data returned');
      }

      console.log('✅ Master recipe updated from wizard successfully:', result.updateMasterRecipeFromWizard.id);
      return result.updateMasterRecipeFromWizard;
    } catch (error) {
      console.error('❌ Error updating master recipe from wizard:', error);
      throw error;
    }
  }

  /**
   * Validate recipe data before submission
   */
  validateRecipeData(wizardData: WizardData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate recipe name
    if (!wizardData.recipeName || wizardData.recipeName.trim().length === 0) {
      errors.push('Recipe name is required');
    }

    // Validate mash bill
    if (wizardData.mashBill) {
      if (!validateMashBill(wizardData.mashBill)) {
        errors.push('Mash bill percentages must total 100%');
      }
      
      // Check for negative values
      const { corn, wheat, maltedBarley, rye } = wizardData.mashBill;
      if (corn < 0 || wheat < 0 || maltedBarley < 0 || rye < 0) {
        errors.push('Mash bill percentages cannot be negative');
      }
    } else {
      errors.push('Mash bill is required');
    }

    // Validate whiskey type
    const validWhiskeyTypes = ['FourGrainBourbon', 'RyeWhiskey', 'WheatWhiskey', 'CornWhiskey', 'MaltWhiskey'];
    if (wizardData.whiskeyType && !validWhiskeyTypes.includes(wizardData.whiskeyType)) {
      errors.push('Invalid whiskey type');
    }

    // Validate cooks per fermentation
    if (wizardData.cooksPerFerm !== undefined && wizardData.cooksPerFerm <= 0) {
      errors.push('Cooks per fermentation must be greater than 0');
    }

    // Validate ingredients
    if (wizardData.ingredients) {
      wizardData.ingredients.forEach((ingredient, index) => {
        if (!ingredient.name || ingredient.name.trim().length === 0) {
          errors.push(`Ingredient ${index + 1}: Name is required`);
        }
        if (!ingredient.itemCode || ingredient.itemCode.trim().length === 0) {
          errors.push(`Ingredient ${index + 1}: Item code is required`);
        }
        if (ingredient.quantity <= 0) {
          errors.push(`Ingredient ${index + 1}: Quantity must be greater than 0`);
        }
      });
    }

    // Validate mashing steps
    if (wizardData.mashingSteps) {
      wizardData.mashingSteps.forEach((step, index) => {
        if (step.timeDuration <= 0) {
          errors.push(`Mashing step ${index + 1}: Time duration must be greater than 0`);
        }
        if (step.heatTempSp !== undefined && step.heatTempSp < 0) {
          errors.push(`Mashing step ${index + 1}: Heat temperature cannot be negative`);
        }
        if (step.coolTempSp !== undefined && step.coolTempSp < 0) {
          errors.push(`Mashing step ${index + 1}: Cool temperature cannot be negative`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate recipe code from wizard data
   */
  generateRecipeCodeFromData(wizardData: WizardData): string {
    if (!wizardData.mashBill) {
      return 'INVALID-MASHBILL';
    }
    
    return generateRecipeCode(
      wizardData.whiskeyType || 'FourGrainBourbon',
      wizardData.mashBill,
      wizardData.revision || 'R01'
    );
  }
}

// Export a singleton instance of the service
export const masterRecipeService = new MasterRecipeService(); 