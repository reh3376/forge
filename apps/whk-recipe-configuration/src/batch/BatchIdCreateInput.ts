import { ArgsType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional } from "class-validator";
import { GraphQLJSON } from "graphql-type-json";
import { AssetWhereUniqueInput } from "../asset/base/AssetWhereUniqueInput";
import { InputJsonValue } from "../types";
import { IsJSONValue } from "../validators";

@ArgsType()
class BatchIdCreateInput {
  @Field(() => String)
  @ApiProperty({
    required: true,
    type: () => String,
  })
  @Type(() => String)
  operation!: string;

  @ApiProperty({
    required: false,
  })
  @IsJSONValue()
  @IsOptional()
  @Field(() => GraphQLJSON, {
    nullable: true,
  })
  batchData?: InputJsonValue;

  @ApiProperty({
    required: false,
  })
  @IsJSONValue()
  @IsOptional()
  @Field(() => GraphQLJSON, {
    nullable: true,
  })
  parameterData?: InputJsonValue;

  @ApiProperty({
    required: false,
  })
  @IsJSONValue()
  @IsOptional()
  @Field(() => GraphQLJSON, {
    nullable: true,
  })
  initialData?: InputJsonValue;

  @ApiProperty({
    required: false,
  })
  @Type(() => AssetWhereUniqueInput)
  @IsOptional()
  @Field(() => AssetWhereUniqueInput, {
    nullable: true,
  })
  asset?: AssetWhereUniqueInput;

  @ApiProperty({
    required: false,
  })
  @Type(() => String)
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  assetPath?: string;

  @ApiProperty({
    required: false,
  })
  @Type(() => String)
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  recipeId?: string;

  @ApiProperty({
    required: false,
  })
  @Type(() => Number)
  @IsOptional()
  @Field(() => Number, {
    nullable: true,
  })
  quantity?: number;

  @Field(() => String)
  @ApiProperty({
    required: true,
    type: () => String,
  })
  @Type(() => String)
  createdBy!: string;
}

export { BatchIdCreateInput as BatchIdCreateInput };
