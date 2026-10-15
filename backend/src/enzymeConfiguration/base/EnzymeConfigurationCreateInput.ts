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
class EnzymeConfigurationCreateInput {
  @ApiProperty({
    required: true,
    enum: EnumEnzymeCategory,
  })
  @IsEnum(EnumEnzymeCategory)
  @Field(() => EnumEnzymeCategory)
  category!: "LIQUIFACTION" | "SACCHARIFICATION" | "VISCOSITY";

  @ApiProperty({
    required: true,
    type: String,
  })
  @IsString()
  @MaxLength(1000)
  @Field(() => String)
  createdBy!: string;

  @ApiProperty({
    required: true,
    type: Number,
  })
  @IsNumber()
  @Min(0)
  @Max(1000)
  @Field(() => Number)
  dosePerMetricTon!: number;

  @ApiProperty({
    required: true,
    type: String,
  })
  @IsString()
  @Field(() => String)
  instructions!: string;

  @ApiProperty({
    required: true,
    type: String,
  })
  @IsString()
  @Field(() => String)
  itemId!: string;

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
}

export { EnzymeConfigurationCreateInput as EnzymeConfigurationCreateInput };
