
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
import { EnumPurchaseOrderReceiptStatus } from "./base/EnumPurchaseOrderReceiptStatus";
import { PurchaseOrderCreateNestedManyWithoutPurchaseOrdersInput } from "./base/PurchaseOrderCreateNestedManyWithoutPurchaseOrdersInput";
import { ItemReceiptCreateNestedManyWithoutPurchaseOrdersInput } from "./base/ItemReceiptCreateNestedManyWithoutPurchaseOrdersInput";
import { LotCreateNestedManyWithoutPurchaseOrdersInput } from "./base/LotCreateNestedManyWithoutPurchaseOrdersInput";
import { ItemCreateNestedManyWithoutPurchaseOrdersInput } from "./base/ItemCreateNestedManyWithoutPurchaseOrdersInput";
import { TestParameterCreateNestedManyWithoutPurchaseOrdersInput } from "./base/TestParameterCreateNestedManyWithoutPurchaseOrdersInput";
import { IsJSONValue } from "../validators";
import { GraphQLJSON } from "graphql-type-json";
import { InputJsonValue } from "../types";
import { VendorWhereUniqueInput } from "../vendor/VendorWhereUniqueInput";
import { VendorWhereConnectUniqueInput } from "../vendor/VendorWhereConnectUniqueInput";

@InputType()
class PurchaseOrderCreateInput {
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
    required: true,
    type: String,
  })
  @IsString()
  @MaxLength(256)
  @Field(() => String)
  createdBy!: string;

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
    required: true,
    type: String,
  })
  @IsString()
  @MaxLength(256)
  @Field(() => String)
  name!: string;

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
    enum: EnumPurchaseOrderReceiptStatus,
  })
  @IsEnum(EnumPurchaseOrderReceiptStatus)
  @IsOptional()
  @Field(() => EnumPurchaseOrderReceiptStatus, {
    nullable: true,
  })
  receiptStatus?:
    | "NotReceived"
    | "ReceiptInProgress"
    | "ReceiptComplete"
    | "PurchaseOrderComplete"
    | "InitializedNotReceived"
    | "ReceivedTested"
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
    type: () => PurchaseOrderCreateNestedManyWithoutPurchaseOrdersInput,
  })
  @ValidateNested()
  @Type(() => PurchaseOrderCreateNestedManyWithoutPurchaseOrdersInput)
  @IsOptional()
  @Field(() => PurchaseOrderCreateNestedManyWithoutPurchaseOrdersInput, {
    nullable: true,
  })
  lotsRejected?: PurchaseOrderCreateNestedManyWithoutPurchaseOrdersInput;

  @ApiProperty({
    required: false,
    type: () => ItemReceiptCreateNestedManyWithoutPurchaseOrdersInput,
  })
  @ValidateNested()
  @Type(() => ItemReceiptCreateNestedManyWithoutPurchaseOrdersInput)
  @IsOptional()
  @Field(() => ItemReceiptCreateNestedManyWithoutPurchaseOrdersInput, {
    nullable: true,
  })
  itemReceipts?: ItemReceiptCreateNestedManyWithoutPurchaseOrdersInput;

  @ApiProperty({
    required: false,
    type: () => LotCreateNestedManyWithoutPurchaseOrdersInput,
  })
  @ValidateNested()
  @Type(() => LotCreateNestedManyWithoutPurchaseOrdersInput)
  @IsOptional()
  @Field(() => LotCreateNestedManyWithoutPurchaseOrdersInput, {
    nullable: true,
  })
  acceptedLots?: LotCreateNestedManyWithoutPurchaseOrdersInput;

  @ApiProperty({
    required: true,
    type: () => ItemCreateNestedManyWithoutPurchaseOrdersInput,
  })
  @ValidateNested()
  @Type(() => ItemCreateNestedManyWithoutPurchaseOrdersInput)
  @IsOptional()
  @Field(() => ItemCreateNestedManyWithoutPurchaseOrdersInput, {
    nullable: true,
  })
  item?: ItemCreateNestedManyWithoutPurchaseOrdersInput;

  @ApiProperty({
    required: false,
    type: () => TestParameterCreateNestedManyWithoutPurchaseOrdersInput,
  })
  @ValidateNested()
  @Type(() => TestParameterCreateNestedManyWithoutPurchaseOrdersInput)
  @IsOptional()
  @Field(() => TestParameterCreateNestedManyWithoutPurchaseOrdersInput, {
    nullable: true,
  })
  qualityTests?: TestParameterCreateNestedManyWithoutPurchaseOrdersInput;

  @ApiProperty({
    required: true,
    type: String,
  })
  @IsString()
  @MaxLength(1000)
  @Field(() => String)
  globalId!: string;

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
    required: true,
    type: String,
  })
  @IsString()
  @MaxLength(100)
  @Field(() => String)
  erpId!: string;

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

export { PurchaseOrderCreateInput as PurchaseOrderCreateInput };
  