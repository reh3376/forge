import { ObjectType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsDate,
  ValidateNested,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";
import { Lot } from "../../lot/base/Lot";

@ObjectType()
class WhiskeyType {
  @ApiProperty({
    required: true,
    type: String,
  })
  @IsString()
  @Field(() => String)
  id!: string;

  @ApiProperty({
    required: true,
  })
  @IsDate()
  @Type(() => Date)
  @Field(() => Date)
  createdAt!: Date;

  @ApiProperty({
    required: true,
  })
  @IsDate()
  @Type(() => Date)
  @Field(() => Date)
  updatedAt!: Date;

  @ApiProperty({
    required: true,
    type: String,
  })
  @IsString()
  @MaxLength(10)
  @Field(() => String)
  code!: string;

  @ApiProperty({
    required: true,
    type: String,
  })
  @IsString()
  @Field(() => String)
  name!: string;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  category!: string | null;

  @ApiProperty({
    required: true,
    type: Boolean,
  })
  @IsBoolean()
  @Field(() => Boolean)
  active!: boolean;

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
    type: Boolean,
  })
  @IsBoolean()
  @Field(() => Boolean)
  isTTBDefinition!: boolean;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  ttbWhiskeyTypeId!: string | null;

  @ApiProperty({
    required: false,
    type: () => [Lot],
  })
  @ValidateNested()
  @Type(() => Lot)
  @IsOptional()
  lots?: Array<Lot>;

  @ApiProperty({
    required: false,
    type: () => WhiskeyType,
  })
  @ValidateNested()
  @Type(() => WhiskeyType)
  @IsOptional()
  ttbWhiskeyType?: WhiskeyType | null;

  @ApiProperty({
    required: false,
    type: () => [WhiskeyType],
  })
  @ValidateNested()
  @Type(() => WhiskeyType)
  @IsOptional()
  derivedWhiskeyTypes?: Array<WhiskeyType>;
}

export { WhiskeyType as WhiskeyType };
