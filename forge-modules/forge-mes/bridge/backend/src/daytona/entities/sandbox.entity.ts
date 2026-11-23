import { Field, ObjectType, ID } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Status of a Daytona sandbox
 */
export enum SandboxStatus {
  CREATING = "creating",
  ACTIVE = "active",
  STOPPED = "stopped",
  ERROR = "error",
  DELETED = "deleted",
}

/**
 * Sandbox entity representing a Daytona sandbox instance
 */
@ObjectType()
export class Sandbox {
  @Field(() => ID)
  @ApiProperty({
    description: "Unique identifier for the sandbox",
    example: "sandbox-123e4567-e89b-12d3-a456-426614174000",
  })
  id!: string;

  @Field()
  @ApiProperty({
    description: "Programming language of the sandbox",
    example: "typescript",
  })
  language!: string;

  @Field({ nullable: true })
  @ApiProperty({
    description: "Optional name/description",
    example: "Recipe calculation test",
    required: false,
  })
  name?: string;

  @Field()
  @ApiProperty({
    description: "Current status of the sandbox",
    enum: SandboxStatus,
    example: SandboxStatus.ACTIVE,
  })
  status!: SandboxStatus;

  @Field()
  @ApiProperty({
    description: "User ID who created the sandbox",
    example: "user-123",
  })
  createdBy!: string;

  @Field()
  @ApiProperty({
    description: "Creation timestamp",
    example: "2025-01-17T10:30:00Z",
  })
  createdAt!: Date;

  @Field({ nullable: true })
  @ApiProperty({
    description: "Last activity timestamp",
    example: "2025-01-17T11:45:00Z",
    required: false,
  })
  lastActivity?: Date;

  @Field({ nullable: true })
  @ApiProperty({
    description: "Environment variables (sanitized)",
    required: false,
  })
  envVars?: string;
}

/**
 * Command execution result
 */
@ObjectType()
export class CommandResult {
  @Field()
  @ApiProperty({
    description: "Standard output from the command",
    example: "Test passed successfully",
  })
  stdout!: string;

  @Field()
  @ApiProperty({
    description: "Standard error from the command",
    example: "",
  })
  stderr!: string;

  @Field()
  @ApiProperty({
    description: "Exit code of the command",
    example: 0,
  })
  exitCode!: number;

  @Field()
  @ApiProperty({
    description: "Execution duration in milliseconds",
    example: 1523,
  })
  duration!: number;
}
