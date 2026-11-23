import { ObjectType, Field, Float, Int, InputType } from "@nestjs/graphql";
import { EnumRecipeWhiskeyType } from "../../recipe/base/EnumRecipeWhiskeyType";

@ObjectType()
export class MetricUsed {
  @Field(() => String)
  name!: string;

  @Field(() => Float)
  value!: number;
}

@ObjectType()
export class YieldEstimateResult {
  @Field(() => Float)
  estimatedPGsPerBushel!: number;

  @Field(() => Float)
  estimatedPGsPerBbl!: number;

  @Field(() => Float)
  estimatedBarrelsPerFermenter!: number;

  @Field(() => Float)
  totalProofGallons!: number;

  @Field(() => Float)
  totalGrainWeight!: number;

  @Field(() => Int)
  totalCooks!: number;

  @Field(() => Int)
  totalFermenters!: number;

  @Field(() => Float)
  grainUnitsPerFerm!: number;

  @Field(() => Float)
  pgPerFerm!: number;

  @Field(() => Int)
  totalBarrels!: number;

  @Field(() => Int)
  plannedCooks!: number;

  @Field(() => Int)
  plannedFermenters!: number;

  @Field(() => Float)
  estBarrelYield!: number;

  @Field(() => Float)
  daysProduction!: number;

  @Field(() => Float)
  fcstAttainment!: number;

  @Field(() => [MetricUsed])
  metricsUsed!: MetricUsed[];
}

@InputType()
export class YieldEstimateInput {
  @Field(() => EnumRecipeWhiskeyType)
  whiskeyType!: keyof typeof EnumRecipeWhiskeyType;

  @Field(() => Int)
  totalBarrels!: number;

  @Field(() => Float)
  entryProof!: number;

  @Field(() => String, { nullable: true, defaultValue: "LargeBarrel" })
  containerType?: string;

  @Field(() => Float, { nullable: true })
  grainPerCook?: number;

  @Field(() => Float, { nullable: true })
  cooksPerFerm?: number;

  @Field(() => Float, { nullable: true })
  yieldRateOverride?: number;
}
