import {
  ObjectType,
  Field,
  ID,
  Float,
  InputType,
  registerEnumType,
} from "@nestjs/graphql";
import {
  EnumRecipeInstanceStatus,
  EnumProductionPhase,
  EnumRecipeParameterCategory,
} from "@prisma/client";

// Register enums for GraphQL
registerEnumType(EnumRecipeInstanceStatus, {
  name: "EnumRecipeInstanceStatus",
  description: "Status of a recipe instance",
});

registerEnumType(EnumProductionPhase, {
  name: "EnumProductionPhase",
  description: "Current production phase",
});

registerEnumType(EnumRecipeParameterCategory, {
  name: "EnumRecipeParameterCategory",
  description: "Category of recipe parameter (Input, Output, Calculated)",
});

// Re-export enums for use in resolvers
export {
  EnumRecipeInstanceStatus,
  EnumProductionPhase,
  EnumRecipeParameterCategory,
};

@ObjectType()
export class ScheduleOrderRecipeInstanceType {
  @Field(() => ID)
  id!: string;

  @Field()
  scheduleOrderId!: string;

  @Field()
  recipeId!: string;

  @Field(() => EnumRecipeInstanceStatus)
  status!: EnumRecipeInstanceStatus;

  @Field(() => EnumProductionPhase)
  currentPhase!: EnumProductionPhase;

  @Field({ nullable: true })
  separationStarted?: boolean;

  @Field({ nullable: true })
  separationCompletedAt?: Date;

  @Field()
  createdBy!: string;

  @Field()
  createdAt!: Date;

  @Field({ nullable: true })
  updatedAt?: Date;
}

@ObjectType()
export class BomActualSummary {
  @Field({ nullable: true })
  itemId?: string;

  @Field()
  itemName!: string;

  @Field(() => Float)
  totalQuantityPlanned!: number;

  @Field(() => Float)
  totalQuantityActual!: number;

  @Field(() => [String])
  lots!: string[];
}

@ObjectType()
export class ParameterActualSummary {
  @Field()
  parameterName!: string;

  @Field(() => EnumRecipeParameterCategory, { nullable: true })
  category?: EnumRecipeParameterCategory;

  @Field(() => Float, { nullable: true })
  valuePlanned?: number;

  @Field(() => Float, { nullable: true })
  valueActual?: number;
}

@ObjectType()
export class YieldsSummary {
  @Field(() => Float)
  totalWineGallons!: number;

  @Field(() => Float)
  totalProofGallons!: number;
}

@ObjectType()
export class ActualsSummaryType {
  @Field(() => [BomActualSummary])
  bomActuals!: BomActualSummary[];

  @Field(() => [ParameterActualSummary])
  parameterActuals!: ParameterActualSummary[];

  @Field(() => YieldsSummary)
  yields!: YieldsSummary;
}

@ObjectType()
export class ScheduleOrderRecipeInstanceWithActuals {
  @Field(() => ScheduleOrderRecipeInstanceType)
  instance!: ScheduleOrderRecipeInstanceType;

  @Field(() => ActualsSummaryType, { nullable: true })
  actualsSummary?: ActualsSummaryType;
}

// ============================================
// Types for SO Recipe Component Editing
// ============================================

// Input types for updating components
@InputType()
export class UpdateBomItemInput {
  @Field(() => ID)
  id!: string;

  @Field(() => Float, { nullable: true })
  quantity?: number;
}

@InputType()
export class UpdateRecipeParameterInput {
  @Field(() => ID)
  id!: string;

  @Field(() => Float, { nullable: true })
  recipeNumericalSetpoint?: number;

  @Field({ nullable: true })
  recipeSetpointBooleanValue?: boolean;

  @Field(() => Float, { nullable: true })
  recipeSetpointUpperLimit?: number;

  @Field(() => Float, { nullable: true })
  recipeSetpointLowerLimit?: number;
}

@InputType()
export class UpdateMashingStepInput {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  index?: number;

  @Field(() => Float, { nullable: true })
  stepTime?: number;

  @Field(() => Float, { nullable: true })
  temperatureSetpoint?: number;

  @Field({ nullable: true })
  heatEnabled?: boolean;

  @Field(() => Float, { nullable: true })
  heatTempSp?: number;

  @Field({ nullable: true })
  coolEnabled?: boolean;

  @Field(() => Float, { nullable: true })
  coolTempSp?: number;

  @Field({ nullable: true })
  agitatorEnabled?: boolean;

  @Field(() => Float, { nullable: true })
  agitatorSpdSp?: number;

  @Field({ nullable: true })
  promptMessage?: string;
}

@InputType()
export class UpdateSORecipeComponentsInput {
  @Field(() => [UpdateBomItemInput], { nullable: true })
  bomItems?: UpdateBomItemInput[];

  @Field(() => [UpdateRecipeParameterInput], { nullable: true })
  parameters?: UpdateRecipeParameterInput[];

  @Field(() => [UpdateMashingStepInput], { nullable: true })
  mashingSteps?: UpdateMashingStepInput[];
}

// Output types for components query
@ObjectType()
export class SORecipeItemType {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  itemName?: string;

  @Field({ nullable: true })
  itemCode?: string;

  @Field({ nullable: true })
  itemNumber?: string;
}

@ObjectType()
export class SORecipeUnitsType {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  abbreviation?: string;
}

@ObjectType()
export class SORecipeBomItemType {
  @Field(() => ID)
  id!: string;

  @Field(() => Float, { nullable: true })
  quantity?: number;

  @Field(() => SORecipeItemType, { nullable: true })
  item?: SORecipeItemType;

  @Field(() => SORecipeUnitsType, { nullable: true })
  displayUnits?: SORecipeUnitsType;
}

@ObjectType()
export class SORecipeBomType {
  @Field(() => ID)
  id!: string;

  @Field(() => [SORecipeBomItemType])
  recipeBomITem!: SORecipeBomItemType[];
}

@ObjectType()
export class SORecipeParameterType {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  recipeParamName?: string;

  @Field({ nullable: true })
  recipeParamDescription?: string;

  @Field({ nullable: true })
  recipeSetpointType?: string;

  @Field(() => Float, { nullable: true })
  recipeNumericalSetpoint?: number;

  @Field({ nullable: true })
  recipeSetpointBooleanValue?: boolean;

  @Field(() => Float, { nullable: true })
  recipeSetpointUpperLimit?: number;

  @Field(() => Float, { nullable: true })
  recipeSetpointLowerLimit?: number;

  @Field(() => EnumRecipeParameterCategory, { nullable: true })
  parameterCategory?: EnumRecipeParameterCategory;

  @Field(() => SORecipeUnitsType, { nullable: true })
  units?: SORecipeUnitsType;
}

@ObjectType()
export class SOMashingStepType {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  index?: number;

  @Field({ nullable: true })
  stepType?: string;

  @Field({ nullable: true })
  holdType?: string;

  @Field(() => Float, { nullable: true })
  stepTime?: number;

  @Field(() => Float, { nullable: true })
  temperatureSetpoint?: number;

  @Field({ nullable: true })
  heatEnabled?: boolean;

  @Field(() => Float, { nullable: true })
  heatTempSp?: number;

  @Field({ nullable: true })
  coolEnabled?: boolean;

  @Field(() => Float, { nullable: true })
  coolTempSp?: number;

  @Field({ nullable: true })
  agitatorEnabled?: boolean;

  @Field(() => Float, { nullable: true })
  agitatorSpdSp?: number;

  @Field({ nullable: true })
  promptMessage?: string;

  @Field(() => [SORecipeBomItemType], { nullable: true })
  recipeBomItem?: SORecipeBomItemType[];
}

@ObjectType()
export class SOMashingProtocolType {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  name?: string;

  @Field(() => [SOMashingStepType])
  steps!: SOMashingStepType[];
}

@ObjectType()
export class SOScheduleOrderInfoType {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  status?: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  scheduleOrderNumber?: string;
}

@ObjectType()
export class SORecipeInfoType {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  revision?: number;
}

@ObjectType()
export class SORecipeInstanceWithComponentsType {
  @Field(() => ID)
  id!: string;

  @Field(() => EnumRecipeInstanceStatus)
  status!: EnumRecipeInstanceStatus;

  @Field({ nullable: true })
  updatedAt?: Date;

  @Field({ nullable: true })
  createdAt?: Date;

  @Field(() => SOScheduleOrderInfoType, { nullable: true })
  scheduleOrder?: SOScheduleOrderInfoType;

  @Field(() => SORecipeInfoType, { nullable: true })
  recipe?: SORecipeInfoType;

  @Field(() => [SORecipeBomType])
  recipeBoms!: SORecipeBomType[];

  @Field(() => [SORecipeParameterType])
  recipeParameters!: SORecipeParameterType[];

  @Field(() => [SOMashingProtocolType])
  mashingProtocols!: SOMashingProtocolType[];
}

// ============================================
// Types for Change History
// ============================================

import GraphQLJSON from "graphql-type-json";

@ObjectType()
export class ChangeHistoryUserType {
  @Field()
  username!: string;

  @Field({ nullable: true })
  firstName?: string;

  @Field({ nullable: true })
  lastName?: string;
}

@ObjectType()
export class ChangeHistorySummaryType {
  @Field()
  bomItemsModified!: number;

  @Field()
  parametersModified!: number;

  @Field()
  mashingStepsModified!: number;
}

@ObjectType()
export class FieldChangeType {
  @Field(() => GraphQLJSON, { nullable: true })
  old?: any;

  @Field(() => GraphQLJSON, { nullable: true })
  new?: any;
}

@ObjectType()
export class BomItemChangeType {
  @Field(() => ID)
  id!: string;

  @Field()
  itemName!: string;

  @Field(() => GraphQLJSON)
  changes!: Record<string, { old: any; new: any }>;
}

@ObjectType()
export class ParameterChangeType {
  @Field(() => ID)
  id!: string;

  @Field()
  parameterName!: string;

  @Field(() => GraphQLJSON)
  changes!: Record<string, { old: any; new: any }>;
}

@ObjectType()
export class MashingStepChangeType {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  stepIndex?: number;

  @Field({ nullable: true })
  stepType?: string;

  @Field(() => GraphQLJSON)
  changes!: Record<string, { old: any; new: any }>;
}

@ObjectType()
export class ComponentChangesType {
  @Field(() => [BomItemChangeType])
  bomItems!: BomItemChangeType[];

  @Field(() => [ParameterChangeType])
  parameters!: ParameterChangeType[];

  @Field(() => [MashingStepChangeType])
  mashingSteps!: MashingStepChangeType[];
}

@ObjectType()
export class ComponentChangeHistoryEntryType {
  @Field(() => ID)
  id!: string;

  @Field()
  timestamp!: Date;

  @Field(() => String, { nullable: true })
  userId!: string | null;

  @Field(() => ChangeHistoryUserType, { nullable: true })
  user?: ChangeHistoryUserType;

  @Field(() => ChangeHistorySummaryType)
  changesSummary!: ChangeHistorySummaryType;

  @Field(() => ComponentChangesType)
  changes!: ComponentChangesType;
}
