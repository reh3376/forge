import {
  Field,
  ObjectType,
  InputType,
  Int,
  registerEnumType,
} from "@nestjs/graphql";

// ==================== Enums ====================

export enum ImplementationType {
  SYSTEM = "SYSTEM",
  EXPRESSION = "EXPRESSION",
  UNIT_CONVERSION = "UNIT_CONVERSION",
}

registerEnumType(ImplementationType, {
  name: "ImplementationType",
  description: "Type of function implementation",
});

// ==================== Output Types ====================

@ObjectType()
export class UnitReference {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field()
  abbreviation!: string;
}

@ObjectType()
export class FormulaVariableGraphQL {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field()
  displayName!: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  type!: string;

  @Field({ nullable: true })
  defaultValue?: string;

  @Field()
  category!: string;

  @Field(() => Int)
  sortOrder!: number;

  @Field()
  isActive!: boolean;

  @Field()
  isSystem!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class FormulaFunctionGraphQL {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field()
  syntax!: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  category!: string;

  @Field({ nullable: true })
  exampleUsage?: string;

  @Field(() => Int)
  sortOrder!: number;

  @Field()
  isActive!: boolean;

  @Field()
  isSystem!: boolean;

  // Implementation configuration
  @Field(() => ImplementationType)
  implementationType!: ImplementationType;

  @Field({ nullable: true })
  expression?: string;

  @Field({ nullable: true })
  fromUnitId?: string;

  @Field({ nullable: true })
  toUnitId?: string;

  @Field(() => UnitReference, { nullable: true })
  fromUnit?: UnitReference;

  @Field(() => UnitReference, { nullable: true })
  toUnit?: UnitReference;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

// ==================== Input Types ====================

@InputType()
export class CreateFormulaVariableInput {
  @Field()
  name!: string;

  @Field()
  displayName!: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true, defaultValue: "number" })
  type?: string;

  @Field({ nullable: true })
  defaultValue?: string;

  @Field({ nullable: true, defaultValue: "General" })
  category?: string;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  sortOrder?: number;
}

@InputType()
export class UpdateFormulaVariableInput {
  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  displayName?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  type?: string;

  @Field({ nullable: true })
  defaultValue?: string;

  @Field({ nullable: true })
  category?: string;

  @Field(() => Int, { nullable: true })
  sortOrder?: number;

  @Field({ nullable: true })
  isActive?: boolean;
}

@InputType()
export class CreateFormulaFunctionInput {
  @Field()
  name!: string;

  @Field()
  syntax!: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true, defaultValue: "Math" })
  category?: string;

  @Field({ nullable: true })
  exampleUsage?: string;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  sortOrder?: number;

  // Implementation configuration
  @Field(() => ImplementationType, {
    nullable: true,
    defaultValue: ImplementationType.EXPRESSION,
  })
  implementationType?: ImplementationType;

  @Field({
    nullable: true,
    description:
      'Expression formula using x, y, z as arguments (e.g., "x * 3.78541")',
  })
  expression?: string;

  @Field({
    nullable: true,
    description: "Source unit ID for UNIT_CONVERSION type",
  })
  fromUnitId?: string;

  @Field({
    nullable: true,
    description: "Target unit ID for UNIT_CONVERSION type",
  })
  toUnitId?: string;
}

@InputType()
export class UpdateFormulaFunctionInput {
  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  syntax?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  category?: string;

  @Field({ nullable: true })
  exampleUsage?: string;

  @Field(() => Int, { nullable: true })
  sortOrder?: number;

  @Field({ nullable: true })
  isActive?: boolean;

  // Implementation configuration
  @Field(() => ImplementationType, { nullable: true })
  implementationType?: ImplementationType;

  @Field({
    nullable: true,
    description:
      'Expression formula using x, y, z as arguments (e.g., "x * 3.78541")',
  })
  expression?: string;

  @Field({
    nullable: true,
    description: "Source unit ID for UNIT_CONVERSION type",
  })
  fromUnitId?: string;

  @Field({
    nullable: true,
    description: "Target unit ID for UNIT_CONVERSION type",
  })
  toUnitId?: string;
}
