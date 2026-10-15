import { useQueryClient } from '@tanstack/react-query';
import { useMutation as useApolloMutation, useQuery as useApolloQuery } from '@apollo/client';
import { toast } from 'sonner';
import {
  CREATE_MASTER_RECIPE_FROM_WIZARD,
  UPDATE_MASTER_RECIPE_FROM_WIZARD,
  GET_ACTIVE_MASTER_RECIPES,
  GET_MASTER_RECIPE_AS_WIZARD_DATA,
  GET_AVAILABLE_WHISKEY_TYPES,
  GET_AVAILABLE_INGREDIENTS,
  type WizardDataInput
} from '@/lib/api/master-recipe-mutations';
import { recipeKeys } from '@/lib/hooks/use-recipes';
import { useAuth } from '@/lib/auth-context';

// Types for wizard data structure (matching your existing wizard)
interface WizardData {
  details?: {
    Recipe?: string;
    whiskeyType?: string;
    customerCode?: string;
    cooksPerFerm?: number;
    mashBill?: {
      corn: number;
      rye: number;
      wheat: number;
      maltedBarley: number;
    };
  };
  bom?: {
    ingredients?: Array<{
      itemCode: string;
      quantity: number;
      unit: string;
      category: string;
    }>;
  };
  parameters?: {
    parameters?: Array<{
      name: string;
      value: string | number | boolean;
      unit?: string;
    }>;
  };
  mashing?: {
    mashingSteps?: Array<{
      index: number;
      stepType: string;
      holdType?: string;
      targetTemp?: number;
      duration?: number;
      rampRate?: number;
      itemCode?: string;
      quantity?: number;
      unit?: string;
    }>;
  };
}

// Query keys for React Query
export const masterRecipeKeys = {
  all: ['masterRecipes'] as const,
  lists: () => [...masterRecipeKeys.all, 'list'] as const,
  list: (filter?: Record<string, unknown>) => [...masterRecipeKeys.lists(), filter] as const,
  details: () => [...masterRecipeKeys.all, 'detail'] as const,
  detail: (id: string) => [...masterRecipeKeys.details(), id] as const,
};

// Hook to create a new master recipe from wizard data
export function useCreateMasterRecipe() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const [createMasterRecipe, { loading, error }] = useApolloMutation(
    CREATE_MASTER_RECIPE_FROM_WIZARD,
    {
      onCompleted: (data) => {
        // Only show success if we actually got data back
        if (data?.createMasterRecipeFromWizard) {
          toast.success('Recipe created successfully!');
          // Invalidate both master recipe and regular recipe queries
          queryClient.invalidateQueries({ queryKey: masterRecipeKeys.all });
          queryClient.invalidateQueries({ queryKey: recipeKeys.all });
        }
      },
      onError: (error) => {
        console.error('Error creating master recipe:', error);
        toast.error(`Failed to create recipe: ${error.message}`);
      }
    }
  );

  const createRecipe = async (wizardData: WizardData) => {
    try {
      const input = transformWizardDataToInput(wizardData, user?.id || 'system');
      console.log('Creating master recipe with input:', input);
      
      const result = await createMasterRecipe({ variables: { wizardData: input } });
      
      // Check if we actually got a successful result
      if (!result.data?.createMasterRecipeFromWizard) {
        console.error('No data returned from createMasterRecipeFromWizard mutation');
        throw new Error('No data returned from server');
      }
      
      console.log('Master recipe created successfully:', result.data.createMasterRecipeFromWizard);
      return result.data.createMasterRecipeFromWizard;
    } catch (error) {
      console.error('Error in createRecipe:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        wizardData: JSON.stringify(wizardData, null, 2)
      });
      // Re-throw the error so the calling component can handle it
      throw error;
    }
  };

  return {
    createMasterRecipe: createRecipe,
    loading,
    error
  };
}

// Hook to update an existing master recipe from wizard data
export function useUpdateMasterRecipe() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const [updateMasterRecipe, { loading, error }] = useApolloMutation(
    UPDATE_MASTER_RECIPE_FROM_WIZARD,
    {
      onCompleted: () => {
        toast.success('Recipe updated successfully!');
        // Invalidate both master recipe and regular recipe queries
        queryClient.invalidateQueries({ queryKey: masterRecipeKeys.all });
        queryClient.invalidateQueries({ queryKey: recipeKeys.all });
      },
      onError: (error) => {
        console.error('Error updating master recipe:', error);
        toast.error(`Failed to update recipe: ${error.message}`);
      }
    }
  );

  const updateRecipe = async (id: string, wizardData: WizardData) => {
    const input = transformWizardDataToInput(wizardData, user?.id || 'system');
    return updateMasterRecipe({ variables: { id, wizardData: input } });
  };

  return {
    updateMasterRecipe: updateRecipe,
    loading,
    error
  };
}

// Hook to get active master recipes
export function useActiveMasterRecipes() {
  const { data, loading, error, refetch } = useApolloQuery(GET_ACTIVE_MASTER_RECIPES);

  return {
    recipes: data?.getActiveMasterRecipes || [],
    loading,
    error,
    refetch
  };
}

// Hook to get a master recipe as wizard data
export function useMasterRecipeAsWizardData(id: string) {
  const { data, loading, error, refetch } = useApolloQuery(
    GET_MASTER_RECIPE_AS_WIZARD_DATA,
    {
      variables: { id },
      skip: !id
    }
  );

  return {
    wizardData: data?.getMasterRecipeAsWizardData,
    loading,
    error,
    refetch
  };
}

// Hook to get available whiskey types
export function useAvailableWhiskeyTypes() {
  const { data, loading, error } = useApolloQuery(GET_AVAILABLE_WHISKEY_TYPES);

  return {
    whiskeyTypes: data?.getAvailableWhiskeyTypes || [],
    loading,
    error
  };
}

// Hook to get available ingredients
export function useAvailableIngredients() {
  const { data, loading, error } = useApolloQuery(GET_AVAILABLE_INGREDIENTS);

  return {
    ingredients: data?.getAvailableIngredients || [],
    loading,
    error
  };
}

// Utility function to transform wizard data to the backend input format
export function transformWizardDataToInput(
  wizardData: WizardData,
  createdBy: string
): WizardDataInput {
  // Extract parameters from the array format to the flat format expected by backend
  const parametersArray = wizardData.parameters?.parameters || [];
  const parameters: WizardDataInput['parameters'] = {};
  
  // Map known parameter names to the backend structure
  parametersArray.forEach(param => {
    switch (param.name) {
      case 'mashRatio':
        parameters.mashRatio = typeof param.value === 'number' ? param.value : parseFloat(String(param.value));
        break;
      case 'fermentationTime':
        parameters.fermentationTime = typeof param.value === 'number' ? param.value : parseFloat(String(param.value));
        break;
      case 'lowWineProof':
        parameters.lowWineProof = typeof param.value === 'number' ? param.value : parseFloat(String(param.value));
        break;
      case 'highWineProof':
        parameters.highWineProof = typeof param.value === 'number' ? param.value : parseFloat(String(param.value));
        break;
      case 'additionalParameters':
        parameters.additionalParameters = String(param.value);
        break;
      default:
        // For unknown parameters, add them to additionalParameters as a string
        if (!parameters.additionalParameters) {
          parameters.additionalParameters = '';
        }
        parameters.additionalParameters += `${param.name}: ${param.value}${param.unit ? ' ' + param.unit : ''}; `;
        break;
    }
  });

  // Transform BOM ingredients to match backend RecipeIngredientInput schema
  const bomIngredients = (wizardData.bom?.ingredients || []).map(ingredient => ({
    id: ingredient.id || `ing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    itemCode: ingredient.itemCode,
    name: (ingredient.name && ingredient.name.trim()) || ingredient.itemCode || 'Unknown Item', // Handle empty strings
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    category: ingredient.category,
    notes: ingredient.notes
  }));

  // Transform mashing steps to match backend structure
  const mashingSteps = wizardData.mashing?.mashingSteps || [];
  const steps = mashingSteps.map(step => {
    const transformedStep: {
      index: number;
      stepType: string;
      included: boolean;
      holdType?: string;
      notes?: string;
      additiveType?: string;
      temperatureSP?: number;
      timeDuration?: number;
      waterBacksetSP?: number;
    } = {
      index: step.index,
      stepType: step.stepType,
      included: true, // Default to true - all steps are included
    };
    
    // Map frontend fields to backend fields
    if (step.holdType !== undefined) transformedStep.holdType = step.holdType;
    if (step.targetTemp !== undefined) transformedStep.temperatureSP = step.targetTemp;
    if (step.duration !== undefined) transformedStep.timeDuration = step.duration;
    
    // Create notes from item information if available
    if (step.itemCode) {
      transformedStep.notes = `Item: ${step.itemCode}${step.quantity ? `, Qty: ${step.quantity}${step.unit ? ' ' + step.unit : ''}` : ''}`;
    }
    
    return transformedStep;
  });

  const input: WizardDataInput = {
    createdBy,
    active: true, // Default to active
    details: {
      Recipe: wizardData.details?.Recipe || '',
      whiskeyType: wizardData.details?.whiskeyType || 'FourGrainBourbon',
      customerCode: wizardData.details?.customerCode || '',
      cooksPerFerm: wizardData.details?.cooksPerFerm || 3,
      mashBill: wizardData.details?.mashBill || {
        corn: 0,
        rye: 0,
        wheat: 0,
        maltedBarley: 0
      }
    },
    bom: {
      ingredients: bomIngredients
    },
    parameters,
    mashing: {
      steps
    }
  };

  return input;
}

// Legacy function name for backward compatibility
export const transformWizardDataToMasterRecipeInput = transformWizardDataToInput; 