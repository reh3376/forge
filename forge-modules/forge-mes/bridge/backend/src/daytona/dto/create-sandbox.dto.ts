import { Field, InputType, registerEnumType } from "@nestjs/graphql";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsObject,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Supported programming languages for Daytona sandboxes
 */
export enum SandboxLanguage {
  TYPESCRIPT = "typescript",
  JAVASCRIPT = "javascript",
  PYTHON = "python",
  GO = "go",
  RUST = "rust",
  JAVA = "java",
}

registerEnumType(SandboxLanguage, {
  name: "SandboxLanguage",
  description: "Supported programming languages for sandboxes",
});

/**
 * DTO for creating a new Daytona sandbox
 */
@InputType()
export class CreateSandboxDto {
  @Field(() => SandboxLanguage)
  @ApiProperty({
    enum: SandboxLanguage,
    description: "Programming language for the sandbox environment",
    example: SandboxLanguage.TYPESCRIPT,
  })
  @IsEnum(SandboxLanguage)
  @IsNotEmpty()
  language!: SandboxLanguage;

  @Field({ nullable: true })
  @ApiProperty({
    description: "Optional name/description for the sandbox",
    example: "Recipe calculation test environment",
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @Field(() => String, { nullable: true })
  @ApiProperty({
    description: "Environment variables as JSON object",
    example: '{"API_KEY": "test-key", "ENV": "sandbox"}',
    required: false,
  })
  @IsOptional()
  @IsString()
  envVars?: string; // JSON string of key-value pairs

  @Field({ nullable: true })
  @ApiProperty({
    description: "Initial code to execute in the sandbox",
    example: 'console.log("Hello from sandbox");',
    required: false,
  })
  @IsString()
  @IsOptional()
  initialCode?: string;
}
