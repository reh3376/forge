import { Field, ObjectType, InputType, Int, Float } from "@nestjs/graphql";
import { GraphQLJSONObject } from "graphql-type-json";

@ObjectType()
export class FormulaLibraryGraphQL {
  @Field()
  id!: string;

  @Field()
  globalId!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field()
  createdBy!: string;

  @Field({ nullable: true })
  updatedBy?: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  category?: string;

  @Field(() => [String])
  tags!: string[];

  @Field()
  expression!: string;

  @Field(() => Int)
  version!: number;

  @Field()
  isActive!: boolean;

  @Field({ nullable: true })
  documentation?: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  exampleInputs?: any;

  @Field(() => GraphQLJSONObject, { nullable: true })
  expectedOutputs?: any;

  @Field(() => [String])
  requiredVariables!: string[];

  @Field(() => [String])
  optionalVariables!: string[];

  @Field(() => [FormulaLibraryVersionGraphQL], { nullable: true })
  versions?: FormulaLibraryVersionGraphQL[];

  @Field(() => [FormulaTestCaseGraphQL], { nullable: true })
  testCases?: FormulaTestCaseGraphQL[];
}

@ObjectType()
export class FormulaLibraryVersionGraphQL {
  @Field()
  id!: string;

  @Field()
  createdAt!: Date;

  @Field()
  createdBy!: string;

  @Field()
  formulaId!: string;

  @Field(() => Int)
  version!: number;

  @Field()
  expression!: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  changeReason?: string;

  @Field(() => GraphQLJSONObject)
  snapshot!: any;
}

@ObjectType()
export class FormulaTestCaseGraphQL {
  @Field()
  id!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field()
  createdBy!: string;

  @Field()
  formulaId!: string;

  @Field()
  name!: string;

  @Field(() => GraphQLJSONObject)
  inputs!: any;

  @Field(() => Float)
  expectedOutput!: number;

  @Field(() => Float, { nullable: true })
  tolerance?: number;

  @Field({ nullable: true })
  lastRunAt?: Date;

  @Field({ nullable: true })
  lastRunPassed?: boolean;

  @Field(() => Float, { nullable: true })
  lastRunOutput?: number;
}

@ObjectType()
export class ValidationResultGraphQL {
  @Field()
  isValid!: boolean;

  @Field(() => [String])
  errors!: string[];

  @Field(() => [String])
  warnings!: string[];

  @Field(() => [String])
  detectedVariables!: string[];

  @Field(() => [String])
  requiredVariables!: string[];
}

@ObjectType()
export class ExpressionResultGraphQL {
  @Field()
  success!: boolean;

  @Field(() => Float, { nullable: true })
  value?: number;

  @Field({ nullable: true })
  error?: string;

  @Field(() => Int)
  executionTimeMs!: number;

  @Field(() => [String])
  variablesUsed!: string[];
}

@ObjectType()
export class TestResultsGraphQL {
  @Field(() => Int)
  passed!: number;

  @Field(() => Int)
  failed!: number;

  @Field(() => Int)
  total!: number;
}

@ObjectType()
export class UsageStatsGraphQL {
  @Field(() => Int)
  usageCount!: number;

  @Field({ nullable: true })
  lastUsed?: Date;

  @Field(() => Float, { nullable: true })
  avgExecutionTime?: number;
}

@InputType()
export class CreateFormulaInput {
  @Field()
  name!: string;

  @Field()
  expression!: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  category?: string;

  @Field(() => [String], { nullable: true })
  tags?: string[];

  @Field({ nullable: true })
  documentation?: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  exampleInputs?: any;

  @Field(() => GraphQLJSONObject, { nullable: true })
  expectedOutputs?: any;

  @Field()
  createdBy!: string;
}

@InputType()
export class UpdateFormulaInput {
  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  expression?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  category?: string;

  @Field(() => [String], { nullable: true })
  tags?: string[];

  @Field({ nullable: true })
  documentation?: string;

  @Field({ nullable: true })
  isActive?: boolean;

  @Field({ nullable: true })
  changeReason?: string;

  @Field()
  updatedBy!: string;
}

@InputType()
export class FormulaSearchFilters {
  @Field({ nullable: true })
  category?: string;

  @Field(() => [String], { nullable: true })
  tags?: string[];

  @Field({ nullable: true })
  query?: string;

  @Field({ nullable: true })
  isActive?: boolean;
}

@InputType()
export class TestCaseInput {
  @Field()
  name!: string;

  @Field(() => GraphQLJSONObject)
  inputs!: any;

  @Field(() => Float)
  expectedOutput!: number;

  @Field(() => Float, { nullable: true })
  tolerance?: number;

  @Field()
  createdBy!: string;
}

@InputType()
export class UpdateTestCaseInput {
  @Field({ nullable: true })
  name?: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  inputs?: any;

  @Field(() => Float, { nullable: true })
  expectedOutput?: number;

  @Field(() => Float, { nullable: true })
  tolerance?: number;

  @Field()
  updatedBy!: string;
}

@InputType()
export class EvaluateExpressionInput {
  @Field()
  expression!: string;

  @Field(() => GraphQLJSONObject)
  context!: any;
}
