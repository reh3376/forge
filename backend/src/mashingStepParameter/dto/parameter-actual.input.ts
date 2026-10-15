import { InputType, Field, Float } from "@nestjs/graphql";
import { IsOptional, IsString, IsNumber, IsBoolean } from "class-validator";

@InputType()
export class ParameterActualInput {
  @Field(() => String)
  @IsString()
  parameterName!: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  valuePlanned?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  valueActual?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  textValueActual?: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  booleanValueActual?: boolean;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}

@InputType()
export class MaterialConsumptionInput {
  @Field(() => String)
  @IsString()
  recipeBomItemId!: string;

  @Field(() => Float)
  @IsNumber()
  quantityActual!: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  lotNumber?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  addRate?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  addRateUnit?: string;
}
