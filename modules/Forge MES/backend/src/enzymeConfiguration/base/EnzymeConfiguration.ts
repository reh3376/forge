import { ObjectType, Field, registerEnumType } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { Item } from "../../item/base/Item";
import {
  ValidateNested,
  IsOptional,
  IsDate,
  IsString,
  MaxLength,
  IsBoolean,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";

export enum EnumEnzymeCategory {
  LIQUIFACTION = "LIQUIFACTION",
  SACCHARIFICATION = "SACCHARIFICATION",
  VISCOSITY = "VISCOSITY",
}

registerEnumType(EnumEnzymeCategory, {
  name: "EnumEnzymeCategory",
});

@ObjectType()
class EnzymeConfiguration {
  @ApiProperty({
    required: true,
    enum: EnumEnzymeCategory,
  })
  @IsEnum(EnumEnzymeCategory)
  @Field(() => EnumEnzymeCategory)
  category!: "LIQUIFACTION" | "SACCHARIFICATION" | "VISCOSITY";

  @ApiProperty({
    required: true,
  })
  @IsDate()
  @Type(() => Date)
  @Field(() => Date)
  createdAt!: Date;

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
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  globalId!: string | null;

  @ApiProperty({
    required: true,
    type: String,
  })
  @IsString()
  @Field(() => String)
  id!: string;

  @ApiProperty({
    required: true,
    type: String,
  })
  @IsString()
  @Field(() => String)
  instructions!: string;

  @ApiProperty({
    required: false,
    type: () => Item,
  })
  @ValidateNested()
  @Type(() => Item)
  @IsOptional()
  item?: Item;

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
  schemaVersion!: string | null;

  @ApiProperty({
    required: true,
  })
  @IsDate()
  @Type(() => Date)
  @Field(() => Date)
  updatedAt!: Date;

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
  updatedBy!: string | null;

  @ApiProperty({
    required: true,
    type: Boolean,
  })
  @IsBoolean()
  @Field(() => Boolean)
  active!: boolean;
}

export { EnzymeConfiguration as EnzymeConfiguration };
