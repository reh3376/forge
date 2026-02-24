import {
  ObjectType,
  Field,
  ID,
  InputType,
  ArgsType,
  Int,
  registerEnumType,
} from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { AuditAction } from "@prisma/client";
import { GraphQLJSON } from "graphql-type-json";

// Register the AuditAction enum for GraphQL
registerEnumType(AuditAction, {
  name: "AuditAction",
  description: "The type of audit action performed",
});

@ObjectType("AuditLogUser")
export class AuditLogUserGraphQL {
  @Field(() => ID)
  @ApiProperty({
    description: "User ID",
    example: "user123",
  })
  id!: string;

  @Field()
  @ApiProperty({
    description: "Username",
    example: "john.doe",
  })
  username!: string;

  @Field({ nullable: true })
  @ApiProperty({
    description: "First name",
    example: "John",
    required: false,
  })
  firstName?: string;

  @Field({ nullable: true })
  @ApiProperty({
    description: "Last name",
    example: "Doe",
    required: false,
  })
  lastName?: string;
}

@ObjectType("AuditLog")
export class AuditLogGraphQL {
  @Field(() => ID)
  @ApiProperty({
    description: "Unique identifier for the audit log entry",
    example: "clzhhlsx30f09mbc9r5mj02z7",
  })
  id!: string;

  @Field(() => String)
  @ApiProperty({
    description: "Global unique identifier",
    example: "clzhhlsx30f09mbc9r5mj02z8",
  })
  globalId!: string;

  @Field(() => String)
  @ApiProperty({
    description: "Type of entity that was modified",
    example: "EnzymeConfiguration",
  })
  entityType!: string;

  @Field(() => String)
  @ApiProperty({
    description: "ID of the entity that was modified",
    example: "clzhhlsx30f09mbc9r5mj02z9",
  })
  entityId!: string;

  @Field(() => AuditAction)
  @ApiProperty({
    description: "Type of action performed",
    enum: AuditAction,
    example: "UPDATE",
  })
  action!: AuditAction;

  @Field(() => GraphQLJSON, { nullable: true })
  @ApiProperty({
    description:
      "Previous values before the change (null for CREATE operations)",
    example: { dosePerMetricTon: 0.5, instructions: "Old instructions" },
    required: false,
  })
  oldValues?: Record<string, any>;

  @Field(() => GraphQLJSON, { nullable: true })
  @ApiProperty({
    description: "New values after the change (null for DELETE operations)",
    example: { dosePerMetricTon: 0.75, instructions: "Updated instructions" },
    required: false,
  })
  newValues?: Record<string, any>;

  @Field(() => AuditLogUserGraphQL)
  @ApiProperty({
    description: "User who performed the action",
    type: AuditLogUserGraphQL,
  })
  user!: AuditLogUserGraphQL;

  @Field(() => String, { nullable: true })
  @ApiProperty({
    description: "IP address from which the action was performed",
    example: "192.168.1.100",
    required: false,
  })
  ipAddress?: string;

  @Field(() => String, { nullable: true })
  @ApiProperty({
    description: "User agent string from the request",
    example: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    required: false,
  })
  userAgent?: string;

  @Field(() => Date)
  @ApiProperty({
    description: "Timestamp when the action was performed",
    example: "2024-01-01T12:00:00.000Z",
  })
  createdAt!: Date;

  @Field(() => Date)
  @ApiProperty({
    description: "Timestamp when the audit log was last updated",
    example: "2024-01-01T12:00:00.000Z",
  })
  updatedAt!: Date;
}

@ObjectType("PaginatedAuditLogResponse")
export class PaginatedAuditLogResponseGraphQL {
  @Field(() => [AuditLogGraphQL])
  @ApiProperty({
    description: "Array of audit log entries",
    type: [AuditLogGraphQL],
  })
  data!: AuditLogGraphQL[];

  @Field(() => Int)
  @ApiProperty({
    description: "Total number of audit log entries",
    example: 100,
  })
  total!: number;

  @Field(() => Int)
  @ApiProperty({
    description: "Page number (1-based)",
    example: 1,
  })
  page!: number;

  @Field(() => Int)
  @ApiProperty({
    description: "Number of items per page",
    example: 20,
  })
  limit!: number;

  @Field(() => Int)
  @ApiProperty({
    description: "Total number of pages",
    example: 5,
  })
  totalPages!: number;

  @Field(() => Boolean)
  @ApiProperty({
    description: "Indicates if there is a next page",
    example: true,
  })
  hasNextPage!: boolean;

  @Field(() => Boolean)
  @ApiProperty({
    description: "Indicates if there is a previous page",
    example: false,
  })
  hasPreviousPage!: boolean;
}

@ObjectType("FormattedAuditLog")
export class FormattedAuditLogGraphQL {
  @Field(() => ID)
  @ApiProperty({
    description: "Audit log ID",
    example: "clzhhlsx30f09mbc9r5mj02z7",
  })
  id!: string;

  @Field(() => String)
  @ApiProperty({
    description: "Timestamp in ISO format",
    example: "2024-01-01T12:00:00.000Z",
  })
  timestamp!: string;

  @Field(() => String)
  @ApiProperty({
    description: "Action performed",
    example: "UPDATE",
  })
  action!: string;

  @Field(() => String)
  @ApiProperty({
    description: "Entity that was modified",
    example: "EnzymeConfiguration:clzhhlsx30f09mbc9r5mj02z9",
  })
  entity!: string;

  @Field(() => String)
  @ApiProperty({
    description: "User who performed the action",
    example: "John Doe (john.doe)",
  })
  user!: string;

  @Field(() => String, { nullable: true })
  @ApiProperty({
    description: "Summary of changes made",
    example:
      'dosePerMetricTon: 0.5 → 0.75, instructions: "Old instructions" → "Updated instructions"',
    required: false,
  })
  changes?: string;

  @Field(() => String, { nullable: true })
  @ApiProperty({
    description: "IP address from which the action was performed",
    example: "192.168.1.100",
    required: false,
  })
  ipAddress?: string;
}

@InputType("AuditLogFilterInput")
export class AuditLogFilterInput {
  @Field({ nullable: true })
  @ApiProperty({
    description:
      'Filter by entity type (e.g., "EnzymeConfiguration", "SystemConfiguration")',
    example: "EnzymeConfiguration",
    required: false,
  })
  @IsOptional()
  @IsString()
  entityType?: string;

  @Field({ nullable: true })
  @ApiProperty({
    description: "Filter by specific entity ID",
    example: "clzhhlsx30f09mbc9r5mj02z7",
    required: false,
  })
  @IsOptional()
  @IsString()
  entityId?: string;

  @Field(() => AuditAction, { nullable: true })
  @ApiProperty({
    description: "Filter by audit action type",
    enum: AuditAction,
    example: "UPDATE",
    required: false,
  })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @Field({ nullable: true })
  @ApiProperty({
    description: "Filter by user ID who performed the action",
    example: "user123",
    required: false,
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @Field({ nullable: true })
  @ApiProperty({
    description: "Filter by start date (ISO 8601 format)",
    example: "2024-01-01T00:00:00.000Z",
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @Field({ nullable: true })
  @ApiProperty({
    description: "Filter by end date (ISO 8601 format)",
    example: "2024-12-31T23:59:59.999Z",
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

@ArgsType()
export class GetAuditLogsArgs {
  @Field(() => Int, { nullable: true, defaultValue: 1 })
  @ApiProperty({
    description: "Page number (1-based)",
    minimum: 1,
    default: 1,
    example: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @Field(() => Int, { nullable: true, defaultValue: 20 })
  @ApiProperty({
    description: "Number of items per page",
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @Field({ nullable: true, defaultValue: "createdAt" })
  @ApiProperty({
    description: "Field to sort by",
    example: "createdAt",
    default: "createdAt",
    required: false,
  })
  @IsOptional()
  @IsString()
  sortBy?: string = "createdAt";

  @Field({ nullable: true, defaultValue: "desc" })
  @ApiProperty({
    description: "Sort order (asc or desc)",
    example: "desc",
    default: "desc",
    required: false,
  })
  @IsOptional()
  @IsString()
  sortOrder?: string = "desc";

  @Field(() => AuditLogFilterInput, { nullable: true })
  @ApiProperty({
    description: "Filter options",
    type: AuditLogFilterInput,
    required: false,
  })
  @IsOptional()
  filters?: AuditLogFilterInput;
}

@ArgsType()
export class GetEntityAuditHistoryArgs {
  @Field(() => String)
  @ApiProperty({
    description: "Type of entity",
    example: "EnzymeConfiguration",
  })
  @IsString()
  entityType!: string;

  @Field(() => String)
  @ApiProperty({
    description: "ID of the entity",
    example: "clzhhlsx30f09mbc9r5mj02z7",
  })
  @IsString()
  entityId!: string;

  @Field(() => Int, { nullable: true, defaultValue: 1 })
  @ApiProperty({
    description: "Page number (1-based)",
    minimum: 1,
    default: 1,
    example: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @Field(() => Int, { nullable: true, defaultValue: 20 })
  @ApiProperty({
    description: "Number of items per page",
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

@ArgsType()
export class GetUserAuditHistoryArgs {
  @Field(() => String)
  @ApiProperty({
    description: "User ID",
    example: "user123",
  })
  @IsString()
  userId!: string;

  @Field(() => Int, { nullable: true, defaultValue: 1 })
  @ApiProperty({
    description: "Page number (1-based)",
    minimum: 1,
    default: 1,
    example: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @Field(() => Int, { nullable: true, defaultValue: 20 })
  @ApiProperty({
    description: "Number of items per page",
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @Field({ nullable: true })
  @ApiProperty({
    description: "Filter by entity type",
    example: "EnzymeConfiguration",
    required: false,
  })
  @IsOptional()
  @IsString()
  entityType?: string;

  @Field(() => AuditAction, { nullable: true })
  @ApiProperty({
    description: "Filter by audit action type",
    enum: AuditAction,
    example: "UPDATE",
    required: false,
  })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @Field({ nullable: true })
  @ApiProperty({
    description: "Filter by start date (ISO 8601 format)",
    example: "2024-01-01T00:00:00.000Z",
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @Field({ nullable: true })
  @ApiProperty({
    description: "Filter by end date (ISO 8601 format)",
    example: "2024-12-31T23:59:59.999Z",
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

@ArgsType()
export class GetAuditLogByIdArgs {
  @Field(() => ID)
  @ApiProperty({
    description: "Audit log ID",
    example: "clzhhlsx30f09mbc9r5mj02z7",
  })
  @IsString()
  id!: string;
}
