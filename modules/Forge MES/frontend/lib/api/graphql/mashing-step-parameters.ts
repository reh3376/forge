import { gql } from "@apollo/client";

/**
 * GraphQL queries and mutations for Mashing Step Parameter Definitions
 * Used for configuring what parameters each mashing step type captures
 */

// ===== Types =====

export type MashingParameterType = "Float" | "Int" | "Boolean" | "Text" | "Enum";

export type MashingStepType =
  | "Hold"
  | "GrainAdd"
  | "Corn"
  | "Wheat"
  | "Rye"
  | "Malt"
  | "PreMalt"
  | "LiquidAdd"
  | "AdditiveAdd"
  | "Prompt"
  | "SpecialtyGrainAdd";

export interface MashingStepParameterDefinition {
  id: string;
  stepType: MashingStepType;
  parameterName: string;
  displayName: string;
  description?: string;
  parameterType: MashingParameterType;
  unit?: string;
  isRequired: boolean;
  defaultValue?: string;
  validationMin?: number;
  validationMax?: number;
  deviationThreshold?: number;
  displayOrder: number;
  category?: string;
  enumValues?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateMashingStepParameterDefinitionInput {
  stepType: MashingStepType;
  parameterName: string;
  displayName: string;
  parameterType: MashingParameterType;
  description?: string;
  unit?: string;
  isRequired: boolean;
  defaultValue?: string;
  validationMin?: number;
  validationMax?: number;
  deviationThreshold?: number;
  displayOrder?: number;
  category?: string;
  enumValues?: string[];
}

export interface UpdateMashingStepParameterDefinitionInput {
  displayName?: string;
  description?: string;
  unit?: string;
  isRequired?: boolean;
  defaultValue?: string;
  validationMin?: number;
  validationMax?: number;
  deviationThreshold?: number;
  displayOrder?: number;
  category?: string;
  enumValues?: string[];
}

// ===== Queries =====

export const GET_MASHING_STEP_PARAMETER_DEFINITIONS = gql`
  query GetMashingStepParameterDefinitions($stepType: EnumMashingProtocolStepStepType!) {
    mashingStepParameterDefinitions(stepType: $stepType) {
      id
      stepType
      parameterName
      displayName
      description
      parameterType
      unit
      isRequired
      defaultValue
      validationMin
      validationMax
      deviationThreshold
      displayOrder
      category
      enumValues
      createdAt
      updatedAt
    }
  }
`;

export const GET_ALL_MASHING_STEP_PARAMETER_DEFINITIONS = gql`
  query GetAllMashingStepParameterDefinitions {
    allMashingStepParameterDefinitions {
      id
      stepType
      parameterName
      displayName
      description
      parameterType
      unit
      isRequired
      defaultValue
      validationMin
      validationMax
      deviationThreshold
      displayOrder
      category
      enumValues
      createdAt
      updatedAt
    }
  }
`;

// ===== Mutations =====

export const CREATE_MASHING_STEP_PARAMETER_DEFINITION = gql`
  mutation CreateMashingStepParameterDefinition(
    $data: CreateMashingStepParameterDefinitionInput!
    $createdBy: String
  ) {
    createMashingStepParameterDefinition(data: $data, createdBy: $createdBy) {
      id
      stepType
      parameterName
      displayName
      description
      parameterType
      unit
      isRequired
      defaultValue
      validationMin
      validationMax
      deviationThreshold
      displayOrder
      category
      enumValues
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_MASHING_STEP_PARAMETER_DEFINITION = gql`
  mutation UpdateMashingStepParameterDefinition(
    $where: MashingStepParameterDefinitionWhereUniqueInput!
    $data: UpdateMashingStepParameterDefinitionInput!
    $updatedBy: String
  ) {
    updateMashingStepParameterDefinition(where: $where, data: $data, updatedBy: $updatedBy) {
      id
      stepType
      parameterName
      displayName
      description
      parameterType
      unit
      isRequired
      defaultValue
      validationMin
      validationMax
      deviationThreshold
      displayOrder
      category
      enumValues
      createdAt
      updatedAt
    }
  }
`;

export const DELETE_MASHING_STEP_PARAMETER_DEFINITION = gql`
  mutation DeleteMashingStepParameterDefinition(
    $where: MashingStepParameterDefinitionWhereUniqueInput!
  ) {
    deleteMashingStepParameterDefinition(where: $where) {
      id
      parameterName
    }
  }
`;

// ===== Constants =====

export const MASHING_STEP_TYPES: { value: MashingStepType; label: string; description: string; isLegacy?: boolean }[] = [
  { value: "Hold", label: "Hold", description: "Temperature hold step" },
  { value: "GrainAdd", label: "Grain Add", description: "Any grain addition (grain type derived from linked BOM item)" },
  { value: "LiquidAdd", label: "Liquid Add", description: "Water or backset addition" },
  { value: "AdditiveAdd", label: "Additive Add", description: "Enzyme, yeast, or nutrient addition" },
  { value: "Prompt", label: "Prompt", description: "Operator prompt/acknowledgment" },
  // Legacy grain step types - kept for backward compatibility with existing protocols
  { value: "Corn", label: "Corn", description: "Corn grain addition", isLegacy: true },
  { value: "Wheat", label: "Wheat", description: "Wheat grain addition", isLegacy: true },
  { value: "Rye", label: "Rye", description: "Rye grain addition", isLegacy: true },
  { value: "Malt", label: "Malt", description: "Malt addition", isLegacy: true },
  { value: "PreMalt", label: "Pre-Malt", description: "Pre-malt addition", isLegacy: true },
  { value: "SpecialtyGrainAdd", label: "Specialty Grain", description: "Specialty grain addition (oats, spelt, etc.)", isLegacy: true },
];

/** Step types for new protocol creation (excludes legacy grain types) */
export const MASHING_STEP_TYPES_FOR_NEW_PROTOCOLS = MASHING_STEP_TYPES.filter(t => !t.isLegacy);

/** All grain step types (both new GrainAdd and legacy individual types) */
export const GRAIN_STEP_TYPES: MashingStepType[] = [
  "GrainAdd",
  "Corn",
  "Wheat",
  "Rye",
  "Malt",
  "PreMalt",
  "SpecialtyGrainAdd",
];

/** Check if a step type is a grain addition step */
export function isGrainStepType(stepType: string): boolean {
  return GRAIN_STEP_TYPES.includes(stepType as MashingStepType);
}

export const MASHING_PARAMETER_TYPES: { value: MashingParameterType; label: string }[] = [
  { value: "Float", label: "Decimal Number" },
  { value: "Int", label: "Whole Number" },
  { value: "Boolean", label: "Yes/No" },
  { value: "Text", label: "Text" },
  { value: "Enum", label: "Selection List" },
];

export const PARAMETER_CATEGORIES = [
  "Temperature",
  "Timing",
  "Material",
  "Control",
  "Confirmation",
  "Notes",
];
