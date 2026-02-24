import { ApiProperty } from "@nestjs/swagger";
import { AuditAction } from "@prisma/client";

export class AuditLogUserDto {
  @ApiProperty({
    description: "User ID",
    example: "user123",
  })
  id!: string;

  @ApiProperty({
    description: "Username",
    example: "john.doe",
  })
  username!: string;

  @ApiProperty({
    description: "First name",
    example: "John",
    required: false,
  })
  firstName?: string;

  @ApiProperty({
    description: "Last name",
    example: "Doe",
    required: false,
  })
  lastName?: string;
}

export class AuditLogResponseDto {
  @ApiProperty({
    description: "Unique identifier for the audit log entry",
    example: "clzhhlsx30f09mbc9r5mj02z7",
  })
  id!: string;

  @ApiProperty({
    description: "Global unique identifier",
    example: "clzhhlsx30f09mbc9r5mj02z8",
  })
  globalId!: string;

  @ApiProperty({
    description: "Type of entity that was modified",
    example: "EnzymeConfiguration",
  })
  entityType!: string;

  @ApiProperty({
    description: "ID of the entity that was modified",
    example: "clzhhlsx30f09mbc9r5mj02z9",
  })
  entityId!: string;

  @ApiProperty({
    description: "Type of action performed",
    enum: AuditAction,
    example: "UPDATE",
  })
  action!: AuditAction;

  @ApiProperty({
    description:
      "Previous values before the change (null for CREATE operations)",
    example: { dosePerMetricTon: 0.5, instructions: "Old instructions" },
    required: false,
  })
  oldValues?: Record<string, any>;

  @ApiProperty({
    description: "New values after the change (null for DELETE operations)",
    example: { dosePerMetricTon: 0.75, instructions: "Updated instructions" },
    required: false,
  })
  newValues?: Record<string, any>;

  @ApiProperty({
    description: "User who performed the action",
    type: AuditLogUserDto,
  })
  user!: AuditLogUserDto;

  @ApiProperty({
    description: "IP address from which the action was performed",
    example: "192.168.1.100",
    required: false,
  })
  ipAddress?: string;

  @ApiProperty({
    description: "User agent string from the request",
    example: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    required: false,
  })
  userAgent?: string;

  @ApiProperty({
    description: "Timestamp when the action was performed",
    example: "2024-01-01T12:00:00.000Z",
  })
  createdAt!: Date;

  @ApiProperty({
    description: "Timestamp when the audit log was last updated",
    example: "2024-01-01T12:00:00.000Z",
  })
  updatedAt!: Date;

  constructor(partial: Partial<AuditLogResponseDto>) {
    Object.assign(this, partial);
  }
}

export class PaginatedAuditLogResponseDto {
  @ApiProperty({
    description: "Array of audit log entries",
    type: [AuditLogResponseDto],
  })
  data!: AuditLogResponseDto[];

  @ApiProperty({
    description: "Pagination metadata",
    type: "object",
    properties: {
      page: { type: "number", description: "Current page number" },
      limit: { type: "number", description: "Items per page" },
      total: { type: "number", description: "Total number of items" },
      totalPages: { type: "number", description: "Total number of pages" },
      hasNext: { type: "boolean", description: "Whether there is a next page" },
      hasPrev: {
        type: "boolean",
        description: "Whether there is a previous page",
      },
    },
  })
  pagination!: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };

  constructor(
    data: AuditLogResponseDto[],
    page: number,
    limit: number,
    total: number
  ) {
    this.data = data;
    this.pagination = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    };
  }
}

export class FormattedAuditLogDto {
  @ApiProperty({
    description: "Audit log ID",
    example: "clzhhlsx30f09mbc9r5mj02z7",
  })
  id!: string;

  @ApiProperty({
    description: "Timestamp in ISO format",
    example: "2024-01-01T12:00:00.000Z",
  })
  timestamp!: string;

  @ApiProperty({
    description: "Action performed",
    example: "UPDATE",
  })
  action!: string;

  @ApiProperty({
    description: "Entity that was modified",
    example: "EnzymeConfiguration:clzhhlsx30f09mbc9r5mj02z9",
  })
  entity!: string;

  @ApiProperty({
    description: "User who performed the action",
    example: "John Doe (john.doe)",
  })
  user!: string;

  @ApiProperty({
    description: "Summary of changes made",
    example:
      'dosePerMetricTon: 0.5 → 0.75, instructions: "Old instructions" → "Updated instructions"',
    required: false,
  })
  changes?: string;

  @ApiProperty({
    description: "IP address from which the action was performed",
    example: "192.168.1.100",
    required: false,
  })
  ipAddress?: string;
}
