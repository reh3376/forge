import {
  ObjectType,
  Field,
  Float,
  InputType,
  registerEnumType,
} from "@nestjs/graphql";
import { EnumMetricSourceType } from "@prisma/client";
import { EnumRecipeWhiskeyType } from "../../recipe/base/EnumRecipeWhiskeyType";

registerEnumType(EnumMetricSourceType, {
  name: "EnumMetricSourceType",
  description: "Source type for production metric values",
});

@ObjectType()
export class ProductionMetric {
  @Field(() => String)
  id!: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  createdBy?: string | null;

  @Field(() => String, { nullable: true })
  updatedBy?: string | null;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  displayName!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String)
  category!: string;

  @Field(() => [String])
  tags!: string[];

  @Field(() => Float, { nullable: true })
  valueNumeric?: number | null;

  @Field(() => String, { nullable: true })
  valueString?: string | null;

  @Field(() => String, { nullable: true })
  unit?: string | null;

  @Field(() => EnumMetricSourceType)
  sourceType!: keyof typeof EnumMetricSourceType;

  @Field(() => EnumRecipeWhiskeyType, { nullable: true })
  whiskeyType?: keyof typeof EnumRecipeWhiskeyType | null;

  @Field(() => String, { nullable: true })
  recipeGroupId?: string | null;

  @Field(() => Date)
  effectiveFrom!: Date;

  @Field(() => Date, { nullable: true })
  effectiveTo?: Date | null;

  @Field(() => Boolean)
  isActive!: boolean;

  @Field(() => Boolean)
  isSystem!: boolean;

  @Field(() => Date, { nullable: true })
  lastValueChange?: Date | null;

  @Field(() => Float, { nullable: true })
  previousValue?: number | null;
}

@InputType()
export class ProductionMetricCreateInput {
  @Field(() => String)
  name!: string;

  @Field(() => String)
  displayName!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true, defaultValue: "Yield" })
  category?: string;

  @Field(() => [String], { nullable: true })
  tags?: string[];

  @Field(() => Float, { nullable: true })
  valueNumeric?: number | null;

  @Field(() => String, { nullable: true })
  valueString?: string | null;

  @Field(() => String, { nullable: true })
  unit?: string | null;

  @Field(() => EnumMetricSourceType, { nullable: true })
  sourceType?: keyof typeof EnumMetricSourceType;

  @Field(() => EnumRecipeWhiskeyType, { nullable: true })
  whiskeyType?: keyof typeof EnumRecipeWhiskeyType | null;

  @Field(() => Boolean, { nullable: true })
  isSystem?: boolean;
}

@InputType()
export class ProductionMetricUpdateInput {
  @Field(() => String, { nullable: true })
  displayName?: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  category?: string;

  @Field(() => [String], { nullable: true })
  tags?: string[];

  @Field(() => Float, { nullable: true })
  valueNumeric?: number | null;

  @Field(() => String, { nullable: true })
  valueString?: string | null;

  @Field(() => String, { nullable: true })
  unit?: string | null;

  @Field(() => EnumMetricSourceType, { nullable: true })
  sourceType?: keyof typeof EnumMetricSourceType;

  @Field(() => EnumRecipeWhiskeyType, { nullable: true })
  whiskeyType?: keyof typeof EnumRecipeWhiskeyType | null;

  @Field(() => Boolean, { nullable: true })
  isActive?: boolean;

  @Field(() => String, { nullable: true })
  updatedBy?: string | null;
}

@InputType()
export class ProductionMetricWhereUniqueInput {
  @Field(() => String)
  id!: string;
}
