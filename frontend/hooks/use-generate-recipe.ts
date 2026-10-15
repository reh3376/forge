import { useMutation } from '@apollo/client';
import { useQueryClient } from '@tanstack/react-query';
import { GENERATE_RECIPE } from '@/lib/api/recipe-mutations';
import { recipeKeys } from '@/lib/hooks/use-recipes';

export interface GenerateRecipeInput {
  recipeName: string;
  customerId: string;
  whiskeyType?: string;
  description?: string;
  targetVolume?: number;
  alcoholContent?: number;
  mashingRequirements?: string;
  fermentationNotes?: string;
  distillationSpecs?: string;
  agingRequirements?: string;
  qualityStandards?: string;
  createdBy: string;
}

export interface GeneratedRecipe {
  id: string;
  recipeName: string;
  whiskeyType?: string;
  active: boolean;
  customer: {
    id: string;
    name: string;
  };
  parameters?: Array<{
    id: string;
    name: string;
    value: string;
    unit?: string;
  }>;
  recipeBom?: {
    id: string;
    items: Array<{
      id: string;
      item: {
        id: string;
        name: string;
      };
      quantity: number;
      unit?: string;
    }>;
  };
  mashingProtocol?: {
    id: string;
    name: string;
    steps: Array<{
      id: string;
      stepNumber: number;
      temperature?: number;
      duration?: number;
      description?: string;
    }>;
  };
  createdAt: string;
  updatedBy?: string;
}

export function useGenerateRecipe() {
  const queryClient = useQueryClient();
  
  const [generateRecipe, { data, loading, error }] = useMutation<
    { generateRecipe: GeneratedRecipe },
    { input: GenerateRecipeInput }
  >(GENERATE_RECIPE, {
    onCompleted: () => {
      // Invalidate recipe queries to refresh the list
      queryClient.invalidateQueries({ queryKey: recipeKeys.lists() });
    },
    onError: (error) => {
      console.error('Error generating recipe:', error);
    }
  });

  const handleGenerateRecipe = async (input: GenerateRecipeInput) => {
    try {
      const result = await generateRecipe({
        variables: { input },
      });
      return result.data?.generateRecipe;
    } catch (err) {
      console.error('Error generating recipe:', err);
      throw err;
    }
  };

  return {
    generateRecipe: handleGenerateRecipe,
    data: data?.generateRecipe,
    loading,
    error,
  };
} 