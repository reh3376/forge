import {
  ObjectType,
  Field,
  Int,
  Float,
  InputType,
  registerEnumType,
} from "@nestjs/graphql";
import { EnumMashingProtocolStepStepType } from "../../mashingProtocolStep/base/EnumMashingProtocolStepStepType";

// Register the enum for GraphQL
export enum EnumMashingParameterType {
  Float = "Float",
  Int = "Int",
  Boolean = "Boolean",
  Text = "Text",
  Enum = "Enum",
}

registerEnumType(EnumMashingParameterType, {
  name: "EnumMashingParameterType",
  description: "Parameter type for mashing step parameters",
});

@ObjectType()
export class MashingStepParameterDefinition {
  @Field(() => String)
  id!: string;

  @Field(() => String, { nullable: true })
  globalId?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  createdBy?: string | null;

  @Field(() => String, { nullable: true })
  updatedBy?: string | null;

  @Field(() => EnumMashingProtocolStepStepType)
  stepType!: EnumMashingProtocolStepStepType;

  @Field(() => String)
  parameterName!: string;

  @Field(() => String)
  displayName!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => EnumMashingParameterType)
  parameterType!: EnumMashingParameterType;

  @Field(() => String, { nullable: true })
  unit?: string | null;

  @Field(() => Boolean)
  isRequired!: boolean;

  @Field(() => String, { nullable: true })
  defaultValue?: string | null;

  @Field(() => Float, { nullable: true })
  validationMin?: number | null;

  @Field(() => Float, { nullable: true })
  validationMax?: number | null;

  @Field(() => Float, { nullable: true })
  deviationThreshold?: number | null;

  @Field(() => Int)
  displayOrder!: number;

  @Field(() => String, { nullable: true })
  category?: string | null;

  @Field(() => [String])
  enumValues!: string[];
}

@ObjectType()
export class MashingStepParameterActual {
  @Field(() => String)
  id!: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String)
  mashingProtocolStepActualId!: string;

  @Field(() => String, { nullable: true })
  stepExecutionId?: string | null;

  @Field(() => String)
  parameterName!: string;

  @Field(() => Float, { nullable: true })
  valuePlanned?: number | null;

  @Field(() => Float, { nullable: true })
  valueActual?: number | null;

  @Field(() => String, { nullable: true })
  textValueActual?: string | null;

  @Field(() => Boolean, { nullable: true })
  booleanValueActual?: boolean | null;

  @Field(() => Float, { nullable: true })
  deviationPercent?: number | null;

  @Field(() => Boolean, { nullable: true })
  isWithinTolerance?: boolean | null;

  @Field(() => Date)
  recordedAt!: Date;

  @Field(() => String)
  recordedBy!: string;

  @Field(() => String, { nullable: true })
  notes?: string | null;
}

@InputType()
export class MashingStepParameterDefinitionWhereUniqueInput {
  @Field(() => String)
  id!: string;
}

@InputType()
export class CreateMashingStepParameterDefinitionInput {
  @Field(() => EnumMashingProtocolStepStepType)
  stepType!: EnumMashingProtocolStepStepType;

  @Field(() => String)
  parameterName!: string;

  @Field(() => String)
  displayName!: string;

  @Field(() => EnumMashingParameterType)
  parameterType!: EnumMashingParameterType;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String, { nullable: true })
  unit?: string;

  @Field(() => Boolean, { nullable: true })
  isRequired?: boolean;

  @Field(() => String, { nullable: true })
  defaultValue?: string;

  @Field(() => Float, { nullable: true })
  validationMin?: number;

  @Field(() => Float, { nullable: true })
  validationMax?: number;

  @Field(() => Float, { nullable: true })
  deviationThreshold?: number;

  @Field(() => Int, { nullable: true })
  displayOrder?: number;

  @Field(() => String, { nullable: true })
  category?: string;

  @Field(() => [String], { nullable: true })
  enumValues?: string[];
}

@InputType()
export class UpdateMashingStepParameterDefinitionInput {
  @Field(() => String, { nullable: true })
  displayName?: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String, { nullable: true })
  unit?: string;

  @Field(() => Boolean, { nullable: true })
  isRequired?: boolean;

  @Field(() => String, { nullable: true })
  defaultValue?: string;

  @Field(() => Float, { nullable: true })
  validationMin?: number;

  @Field(() => Float, { nullable: true })
  validationMax?: number;

  @Field(() => Float, { nullable: true })
  deviationThreshold?: number;

  @Field(() => Int, { nullable: true })
  displayOrder?: number;

  @Field(() => String, { nullable: true })
  category?: string;

  @Field(() => [String], { nullable: true })
  enumValues?: string[];
}
