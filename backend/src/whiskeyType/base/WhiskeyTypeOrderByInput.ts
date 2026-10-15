import { InputType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { SortOrder } from "../../util/SortOrder";
import { IsOptional, IsEnum } from "class-validator";

@InputType()
class WhiskeyTypeOrderByInput {
  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  id?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  createdAt?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  updatedAt?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  code?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  name?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  description?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  category?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  active?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  globalId?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  isTTBDefinition?: SortOrder;

  @ApiProperty({
    required: false,
    enum: ["asc", "desc"],
  })
  @IsEnum(SortOrder)
  @IsOptional()
  @Field(() => SortOrder, {
    nullable: true,
  })
  ttbWhiskeyTypeId?: SortOrder;
}

export { WhiskeyTypeOrderByInput as WhiskeyTypeOrderByInput };
