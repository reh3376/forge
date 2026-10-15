import { InputType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { AssetWhereUniqueInput } from "../asset/base/AssetWhereUniqueInput";

import {
  ValidateNested,
  IsOptional,
  IsString,
  MaxLength,
  IsBoolean,
  IsInt,
  Max,
  IsDate,
  IsEnum,
} from "class-validator";

import { Expose, Type } from "class-transformer";
import { PurchaseOrderWhereUniqueInput } from "./base/PurchaseOrderWhereUniqueInput";
import { PurchaseOrderUpdateManyWithoutPurchaseOrdersInput } from "./base/PurchaseOrderUpdateManyWithoutPurchaseOrdersInput";
import { ItemReceiptUpdateManyWithoutPurchaseOrdersInput } from "./base/ItemReceiptUpdateManyWithoutPurchaseOrdersInput";
import { LotUpdateManyWithoutPurchaseOrdersInput } from "./base/LotUpdateManyWithoutPurchaseOrdersInput";
import { ItemUpdateManyWithoutPurchaseOrdersInput } from "./base/ItemUpdateManyWithoutPurchaseOrdersInput";
import { TestParameterUpdateManyWithoutPurchaseOrdersInput } from "./base/TestParameterUpdateManyWithoutPurchaseOrdersInput";
import { IsJSONValue } from "../validators";
import { GraphQLJSON } from "graphql-type-json";
import { InputJsonValue } from "../types";
import { VendorWhereUniqueInput } from "../vendor/VendorWhereUniqueInput";
import { VendorWhereConnectUniqueInput } from "../vendor/VendorWhereConnectUniqueInput";
import { EnumPurchaseOrderStatus } from "./base/EnumPurchaseOrderStatus";

@InputType()
class PurchaseOrderUpdateInput {
  @ApiProperty({
    required: false,
    type: () => AssetWhereUniqueInput,
  })
  @ValidateNested()
  @Type(() => AssetWhereUniqueInput)
  @IsOptional()
  @Field(() => AssetWhereUniqueInput, {
    nullable: true,
  })
  asset?: AssetWhereUniqueInput | null;

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
  className?: string | null;

  @ApiProperty({
    required: false,
    type: Boolean,
  })
  @IsBoolean()
  @IsOptional()
  @Field(() => Boolean, {
    nullable: true,
  })
  complete?: boolean | null;

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
  createdBy?: string;

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
  updatedBy?: string | null;

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
  transactionGroup?: string | null;

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
  name?: string;

  @ApiProperty({
    required: false,
    type: Number,
  })
  @IsInt()
  @Max(99999999999)
  @IsOptional()
  @Field(() => Number, {
    nullable: true,
  })
  totalOrderQuantity?: number | null;

  @ApiProperty({
    required: false,
  })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  @Field(() => Date, {
    nullable: true,
  })
  purchaseOrderReceiptDate?: Date | null;

  @ApiProperty({
    required: false,
    type: Boolean,
  })
  @IsBoolean()
  @IsOptional()
  @Field(() => Boolean, {
    nullable: true,
  })
  purchaseOrderReceived?: boolean | null;

  @ApiProperty({
    required: false,
    type: () => PurchaseOrderWhereUniqueInput,
  })
  @ValidateNested()
  @Type(() => PurchaseOrderWhereUniqueInput)
  @IsOptional()
  @Field(() => PurchaseOrderWhereUniqueInput, {
    nullable: true,
  })
  purchaseOrderRejectedLots?: PurchaseOrderWhereUniqueInput | null;

  @ApiProperty({
    required: false,
    enum: EnumPurchaseOrderStatus,
  })
  @IsEnum(EnumPurchaseOrderStatus)
  @IsOptional()
  @Field(() => EnumPurchaseOrderStatus, {
    nullable: true,
  })
  receiptStatus?:
    | "Planned"
    | "Committed"
    | "Initiated"
    | "InProgress"
    | "Complete"
    | null;

  @ApiProperty({
    required: false,
    type: Number,
  })
  @IsInt()
  @Max(99999999999)
  @IsOptional()
  @Field(() => Number, {
    nullable: true,
  })
  receivedQuantity?: number | null;

  @ApiProperty({
    required: false,
    type: Number,
  })
  @IsInt()
  @Max(99999999999)
  @IsOptional()
  @Field(() => Number, {
    nullable: true,
  })
  revision?: number | null;

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
  schemaVersion?: string | null;

  @ApiProperty({
    required: false,
    type: () => PurchaseOrderUpdateManyWithoutPurchaseOrdersInput,
  })
  @ValidateNested()
  @Type(() => PurchaseOrderUpdateManyWithoutPurchaseOrdersInput)
  @IsOptional()
  @Field(() => PurchaseOrderUpdateManyWithoutPurchaseOrdersInput, {
    nullable: true,
  })
  lotsRejected?: PurchaseOrderUpdateManyWithoutPurchaseOrdersInput;

  @ApiProperty({
    required: false,
    type: () => ItemReceiptUpdateManyWithoutPurchaseOrdersInput,
  })
  @ValidateNested()
  @Type(() => ItemReceiptUpdateManyWithoutPurchaseOrdersInput)
  @IsOptional()
  @Field(() => ItemReceiptUpdateManyWithoutPurchaseOrdersInput, {
    nullable: true,
  })
  itemReceipts?: ItemReceiptUpdateManyWithoutPurchaseOrdersInput;

  @ApiProperty({
    required: false,
    type: () => LotUpdateManyWithoutPurchaseOrdersInput,
  })
  @ValidateNested()
  @Type(() => LotUpdateManyWithoutPurchaseOrdersInput)
  @IsOptional()
  @Field(() => LotUpdateManyWithoutPurchaseOrdersInput, {
    nullable: true,
  })
  acceptedLots?: LotUpdateManyWithoutPurchaseOrdersInput;

  @ApiProperty({
    required: false,
    type: () => ItemUpdateManyWithoutPurchaseOrdersInput,
  })
  @ValidateNested()
  @Type(() => ItemUpdateManyWithoutPurchaseOrdersInput)
  @IsOptional()
  @Field(() => ItemUpdateManyWithoutPurchaseOrdersInput, {
    nullable: true,
  })
  item?: ItemUpdateManyWithoutPurchaseOrdersInput;

  @ApiProperty({
    required: false,
    type: () => TestParameterUpdateManyWithoutPurchaseOrdersInput,
  })
  @ValidateNested()
  @Type(() => TestParameterUpdateManyWithoutPurchaseOrdersInput)
  @IsOptional()
  @Field(() => TestParameterUpdateManyWithoutPurchaseOrdersInput, {
    nullable: true,
  })
  qualityTests?: TestParameterUpdateManyWithoutPurchaseOrdersInput;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  globalId?: string;

  @ApiProperty({
    required: false,
  })
  @IsJSONValue()
  @IsOptional()
  @Field(() => GraphQLJSON, {
    nullable: true,
  })
  lineItems?: InputJsonValue;

  @ApiProperty({
    required: false,
    type: String,
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  @Field(() => String, {
    nullable: true,
  })
  erpId?: string;

  @ApiProperty({
    required: false,
    type: () => VendorWhereConnectUniqueInput,
  })
  @Expose()
  @ValidateNested()
  @Type(() => VendorWhereConnectUniqueInput)
  @IsOptional()
  @Field(() => VendorWhereConnectUniqueInput, {
    nullable: true,
  })
  vendor?: VendorWhereConnectUniqueInput;
}

export { PurchaseOrderUpdateInput as PurchaseOrderUpdateInput };
