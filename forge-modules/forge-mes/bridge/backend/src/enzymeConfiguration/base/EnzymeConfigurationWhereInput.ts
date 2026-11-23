import { InputType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { EnumEnzymeCategory } from "./EnzymeConfiguration";
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
} from "class-validator";

@InputType()
class EnzymeConfigurationWhereInput {
  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  id?: string;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  globalId?: string;

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
    type: Boolean,
  })
  @IsBoolean()
  @IsOptional()
  @Field(() => Boolean, {
    nullable: true,
  })
  active?: boolean;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  createdBy?: string;
}

export { EnzymeConfigurationWhereInput as EnzymeConfigurationWhereInput };
