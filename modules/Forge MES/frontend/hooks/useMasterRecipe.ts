import { useState } from 'react';
import {
  CreateMasterRecipeInput,
  UpdateMasterRecipeInput,
  MasterRecipeResponse,
  WizardData,
  masterRecipeService,
  generateRecipeCode,
} from '@/lib/api/graphql/master-recipe-mutations';

interface UseMasterRecipeReturn {
  // Mutation functions
  createRecipe: (input: CreateMasterRecipeInput) => Promise<MasterRecipeResponse | null>;
  updateRecipe: (id: string, input: UpdateMasterRecipeInput) => Promise<MasterRecipeResponse | null>;
  createRecipeFromWizard: (wizardData: WizardData) => Promise<MasterRecipeResponse | null>;
  updateRecipeFromWizard: (id: string, wizardData: WizardData) => Promise<MasterRecipeResponse | null>;
  
  // Utility functions
  validateRecipeData: (wizardData: WizardData) => { isValid: boolean; errors: string[] };
  generateRecipeCodeFromData: (wizardData: WizardData) => string;
  
  // State
  loading: boolean;
  error: string | null;
  lastCreatedRecipe: MasterRecipeResponse | null;
}

export const useMasterRecipe = (): UseMasterRecipeReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCreatedRecipe, setLastCreatedRecipe] = useState<MasterRecipeResponse | null>(null);

  const createRecipe = async (input: CreateMasterRecipeInput): Promise<MasterRecipeResponse | null> => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await masterRecipeService.createMasterRecipe(input);
      setLastCreatedRecipe(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create recipe';
      setError(errorMessage);
      console.error('Error creating master recipe:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateRecipe = async (id: string, input: UpdateMasterRecipeInput): Promise<MasterRecipeResponse | null> => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await masterRecipeService.updateMasterRecipe(id, input);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update recipe';
      setError(errorMessage);
      console.error('Error updating master recipe:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const createRecipeFromWizard = async (wizardData: WizardData): Promise<MasterRecipeResponse | null> => {
    try {
      setLoading(true);
      setError(null);
      
      // Validate the wizard data first
      const validation = validateRecipeData(wizardData);
      if (!validation.isValid) {
        setError(`Validation failed: ${validation.errors.join(', ')}`);
        return null;
      }

      const result = await masterRecipeService.createMasterRecipeFromWizard(wizardData);
      setLastCreatedRecipe(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create recipe from wizard';
      setError(errorMessage);
      console.error('Error creating master recipe from wizard:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateRecipeFromWizard = async (id: string, wizardData: WizardData): Promise<MasterRecipeResponse | null> => {
    try {
      setLoading(true);
      setError(null);
      
      // Validate the wizard data first
      const validation = validateRecipeData(wizardData);
      if (!validation.isValid) {
        setError(`Validation failed: ${validation.errors.join(', ')}`);
        return null;
      }

      const result = await masterRecipeService.updateMasterRecipeFromWizard(id, wizardData);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update recipe from wizard';
      setError(errorMessage);
      console.error('Error updating master recipe from wizard:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const validateRecipeData = (wizardData: WizardData): { isValid: boolean; errors: string[] } => {
    return masterRecipeService.validateRecipeData(wizardData);
  };

  const generateRecipeCodeFromData = (wizardData: WizardData): string => {
    return masterRecipeService.generateRecipeCodeFromData(wizardData);
  };

  return {
    createRecipe,
    updateRecipe,
    createRecipeFromWizard,
    updateRecipeFromWizard,
    validateRecipeData,
    generateRecipeCodeFromData,
    loading,
    error,
    lastCreatedRecipe,
  };
}; 