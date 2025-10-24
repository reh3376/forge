import { InputType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { StringFilter } from "../../util/StringFilter";
import { Type } from "class-transformer";
import { IsOptional, ValidateNested } from "class-validator";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { BooleanFilter } from "../../util/BooleanFilter";
import { DateTimeFilter } from "../../util/DateTimeFilter";

@InputType()
class WhiskeyTypeWhereInput {
  @ApiProperty({
    required: false,
    type: () => [WhiskeyTypeWhereInput],
  })
  @ValidateNested()
  @Type(() => WhiskeyTypeWhereInput)
  @IsOptional()
  @Field(() => [WhiskeyTypeWhereInput], {
    nullable: true,
  })
  AND?: WhiskeyTypeWhereInput[];

  @ApiProperty({
    required: false,
    type: () => [WhiskeyTypeWhereInput],
  })
  @ValidateNested()
  @Type(() => WhiskeyTypeWhereInput)
  @IsOptional()
  @Field(() => [WhiskeyTypeWhereInput], {
    nullable: true,
  })
  OR?: WhiskeyTypeWhereInput[];

  @ApiProperty({
    required: false,
    type: () => [WhiskeyTypeWhereInput],
  })
  @ValidateNested()
  @Type(() => WhiskeyTypeWhereInput)
  @IsOptional()
  @Field(() => [WhiskeyTypeWhereInput], {
    nullable: true,
  })
  NOT?: WhiskeyTypeWhereInput[];

  @ApiProperty({
    required: false,
    type: StringFilter,
  })
  @Type(() => StringFilter)
  @IsOptional()
  @Field(() => StringFilter, {
    nullable: true,
  })
  id?: StringFilter;

  @ApiProperty({
    required: false,
    type: DateTimeFilter,
  })
  @Type(() => DateTimeFilter)
  @IsOptional()
  @Field(() => DateTimeFilter, {
    nullable: true,
  })
  createdAt?: DateTimeFilter;

  @ApiProperty({
    required: false,
    type: DateTimeFilter,
  })
  @Type(() => DateTimeFilter)
  @IsOptional()
  @Field(() => DateTimeFilter, {
    nullable: true,
  })
  updatedAt?: DateTimeFilter;

  @ApiProperty({
    required: false,
    type: StringFilter,
  })
  @Type(() => StringFilter)
  @IsOptional()
  @Field(() => StringFilter, {
    nullable: true,
  })
  code?: StringFilter;

  @ApiProperty({
    required: false,
    type: StringFilter,
  })
  @Type(() => StringFilter)
  @IsOptional()
  @Field(() => StringFilter, {
    nullable: true,
  })
  name?: StringFilter;

  @ApiProperty({
    required: false,
    type: StringNullableFilter,
  })
  @Type(() => StringNullableFilter)
  @IsOptional()
  @Field(() => StringNullableFilter, {
    nullable: true,
  })
  description?: StringNullableFilter;

  @ApiProperty({
    required: false,
    type: StringNullableFilter,
  })
  @Type(() => StringNullableFilter)
  @IsOptional()
  @Field(() => StringNullableFilter, {
    nullable: true,
  })
  category?: StringNullableFilter;

  @ApiProperty({
    required: false,
    type: BooleanFilter,
  })
  @Type(() => BooleanFilter)
  @IsOptional()
  @Field(() => BooleanFilter, {
    nullable: true,
  })
  active?: BooleanFilter;

  @ApiProperty({
    required: false,
    type: StringNullableFilter,
  })
  @Type(() => StringNullableFilter)
  @IsOptional()
  @Field(() => StringNullableFilter, {
    nullable: true,
  })
  globalId?: StringNullableFilter;

  @ApiProperty({
    required: false,
    type: BooleanFilter,
  })
  @Type(() => BooleanFilter)
  @IsOptional()
  @Field(() => BooleanFilter, {
    nullable: true,
  })
  isTTBDefinition?: BooleanFilter;

  @ApiProperty({
    required: false,
    type: StringNullableFilter,
  })
  @Type(() => StringNullableFilter)
  @IsOptional()
  @Field(() => StringNullableFilter, {
    nullable: true,
  })
  ttbWhiskeyTypeId?: StringNullableFilter;
}

export { WhiskeyTypeWhereInput as WhiskeyTypeWhereInput };
