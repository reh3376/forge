import { InputType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  MaxLength,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsOptional,
} from "class-validator";
import { EnumEnzymeCategory } from "./EnzymeConfiguration";

@InputType()
class EnzymeConfigurationUpdateInput {
  @ApiProperty({
    required: false,
    enum: EnumEnzymeCategory,
  })
  @IsEnum(EnumEnzymeCategory)
  @IsOptional()
  @Field(() => EnumEnzymeCategory, {
    nullable: true,
  })
  category?: "LIQUIFACTION" | "SACCHARIFICATION" | "VISCOSITY";

  @ApiProperty({
    required: false,
    type: Number,
  })
  @IsNumber()
  @Min(0)
  @Max(1000)
  @IsOptional()
  @Field(() => Number, {
    nullable: true,
  })
  dosePerMetricTon?: number;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  instructions?: string;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  itemId?: string;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  schemaVersion?: string;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @MaxLength(256)
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  updatedBy?: string;
}

export { EnzymeConfigurationUpdateInput as EnzymeConfigurationUpdateInput };
