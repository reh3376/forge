import {
  Field,
  ObjectType,
  InputType,
  registerEnumType,
} from "@nestjs/graphql";
import { GraphQLJSON } from "graphql-type-json";

// ==================== Enums ====================

export enum EnumBomCalculationMode {
  STATIC = "STATIC",
  FORMULA_GRAIN = "FORMULA_GRAIN",
  FORMULA_WATER = "FORMULA_WATER",
  ENZYME_NORMALIZED = "ENZYME_NORMALIZED",
  EXPRESSION = "EXPRESSION",
}

export enum EnumBomFormulaType {
  SIMPLE_RATIO = "SIMPLE_RATIO",
  WATER_PER_BUSHEL = "WATER_PER_BUSHEL",
  BACKSET_PERCENTAGE = "BACKSET_PERCENTAGE",
  CUSTOM = "CUSTOM",
}

registerEnumType(EnumBomCalculationMode, {
  name: "EnumBomCalculationMode",
  description: "BOM item calculation mode for quantity derivation",
  valuesMap: {
    STATIC: { description: "Fixed quantity (use quantity value directly)" },
    FORMULA_GRAIN: { description: "Calculate based on grain load" },
    FORMULA_WATER: { description: "Calculate based on water load" },
    ENZYME_NORMALIZED: { description: "Use enzyme dosing service" },
    EXPRESSION: { description: "Evaluate custom expression" },
  },
});

registerEnumType(EnumBomFormulaType, {
  name: "EnumBomFormulaType",
  description: "Type of formula calculation",
  valuesMap: {
    SIMPLE_RATIO: {
      description: "Direct multiplication (e.g., grainLoad * 0.7)",
    },
    WATER_PER_BUSHEL: {
      description: "Water based on bushels (e.g., bushels * 4.5)",
    },
    BACKSET_PERCENTAGE: { description: "Percentage of water load" },
    CUSTOM: { description: "Custom formula type" },
  },
});

// ==================== Output Types ====================

@ObjectType()
export class BomFormulaConfig {
  @Field(() => EnumBomCalculationMode, { nullable: true })
  calculationMode?: EnumBomCalculationMode;

  @Field(() => EnumBomFormulaType, { nullable: true })
  formulaType?: EnumBomFormulaType;

  @Field({ nullable: true })
  formulaMultiplier?: number;

  @Field({ nullable: true })
  customExpression?: string;

  @Field({ nullable: true })
  formulaLibraryId?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  expressionVariables?: Record<string, any>;

  @Field({ nullable: true })
  expressionValidated?: boolean;

  @Field({ nullable: true })
  lastCalculatedAt?: Date;
}

// ==================== Input Types ====================

@InputType()
export class BomFormulaConfigInput {
  @Field(() => EnumBomCalculationMode, {
    nullable: true,
    defaultValue: EnumBomCalculationMode.STATIC,
  })
  calculationMode?: EnumBomCalculationMode;

  @Field(() => EnumBomFormulaType, { nullable: true })
  formulaType?: EnumBomFormulaType;

  @Field({
    nullable: true,
    description: "Multiplier for formula calculation (e.g., 0.70 for 70%)",
  })
  formulaMultiplier?: number;

  @Field({
    nullable: true,
    description: "Custom expression for EXPRESSION calculation mode",
  })
  customExpression?: string;

  @Field({ nullable: true, description: "Link to a FormulaLibrary entry" })
  formulaLibraryId?: string;

  @Field(() => GraphQLJSON, {
    nullable: true,
    description: "Variables for expression evaluation",
  })
  expressionVariables?: Record<string, any>;
}
