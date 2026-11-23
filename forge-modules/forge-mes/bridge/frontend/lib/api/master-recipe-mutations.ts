import { gql } from '@apollo/client';

// Updated input types to match the actual backend schema
export interface WizardDataInput {
  createdBy: string; // Required field
  active?: boolean; // Optional field
  revision?: string; // Optional field
  details: {
    Recipe: string; // Required - note the capital R
    whiskeyType: string; // Required
    customerCode: string; // Required
    cooksPerFerm: number; // Required - Float in schema
    mashBill: {
      corn: number;
      rye: number;
      wheat: number;
      maltedBarley: number;
    };
  };
  bom: {
    ingredients: Array<{
      itemCode: string; // Required
      quantity: number; // Required - Float
      unit: string; // Required
      category: string; // Required
      // Note: id, name, operation, createdAt, notes are NOT part of the backend schema
    }>;
  };
  parameters: {
    mashRatio?: number; // Optional - Float in schema
    fermentationTime?: number; // Optional - Float in schema
    lowWineProof?: number; // Optional - Float in schema
    highWineProof?: number; // Optional - Float in schema
    additionalParameters?: string; // Optional - String in schema
  };
  mashing: {
    steps: Array<{
      index: number; // Required - Float
      stepType: string; // Required
      included: boolean; // Required - Boolean
      holdType?: string; // Optional
      notes?: string; // Optional
      additiveType?: string; // Optional
      temperatureSP?: number; // Optional - Float (temperature setpoint)
      timeDuration?: number; // Optional - Float (time duration)
      waterBacksetSP?: number; // Optional - Float (water backset setpoint)
    }>;
  };
}

// Legacy type alias for backward compatibility
export type WizardRecipeInput = WizardDataInput;

export interface MasterRecipeResponse {
  id: string;
  Recipe: string;
  revision: string;
  active: boolean;
  whiskeyType: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

// Create master recipe from wizard data
export const CREATE_MASTER_RECIPE_FROM_WIZARD = gql`
  mutation CreateMasterRecipeFromWizard($wizardData: WizardDataInput!) {
    createMasterRecipeFromWizard(wizardData: $wizardData) {
      id
      Recipe
      revision
      active
      whiskeyType
      createdAt
      createdBy
      updatedAt
      updatedBy
    }
  }
`;

// Update master recipe from wizard data
export const UPDATE_MASTER_RECIPE_FROM_WIZARD = gql`
  mutation UpdateMasterRecipeFromWizard($id: String!, $wizardData: WizardDataInput!) {
    updateMasterRecipeFromWizard(id: $id, wizardData: $wizardData) {
      id
      Recipe
      revision
      active
      whiskeyType
      createdAt
      createdBy
      updatedAt
      updatedBy
    }
  }
`;

// Get master recipe as wizard data
export const GET_MASTER_RECIPE_AS_WIZARD_DATA = gql`
  query GetMasterRecipeAsWizardData($id: String!) {
    getMasterRecipeAsWizardData(id: $id) {
      details {
        Recipe
        whiskeyType
        customerCode
        cooksPerFerm
        mashBill {
          corn
          rye
          wheat
          maltedBarley
        }
      }
      bom {
        ingredients {
          itemCode
          quantity
          unit
          category
        }
      }
      parameters {
        parameters {
          name
          value
          unit
        }
      }
      mashing {
        mashingSteps {
          index
          stepType
          holdType
          targetTemp
          duration
          rampRate
          itemCode
          quantity
          unit
        }
      }
    }
  }
`;

// Get available whiskey types
export const GET_AVAILABLE_WHISKEY_TYPES = gql`
  query GetAvailableWhiskeyTypes {
    getAvailableWhiskeyTypes
  }
`;

// Get available ingredients
export const GET_AVAILABLE_INGREDIENTS = gql`
  query GetAvailableIngredients {
    getAvailableIngredients {
      itemCode
      itemName
      category
      unit
    }
  }
`;

// Get active master recipes
export const GET_ACTIVE_MASTER_RECIPES = gql`
  query GetActiveMasterRecipes {
    getActiveMasterRecipes {
      id
      Recipe
      revision
      active
      whiskeyType
      createdAt
      createdBy
      updatedAt
      updatedBy
    }
  }
`; 