import { Field, InputType, Int } from "@nestjs/graphql";
import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * DTO for executing a command in a Daytona sandbox
 */
@InputType()
export class ExecuteCommandDto {
  @Field()
  @ApiProperty({
    description: "The sandbox ID to execute the command in",
    example: "sandbox-123e4567-e89b-12d3-a456-426614174000",
  })
  @IsString()
  @IsNotEmpty()
  sandboxId!: string;

  @Field()
  @ApiProperty({
    description: "The command to execute",
    example: "npm test",
  })
  @IsString()
  @IsNotEmpty()
  command!: string;

  @Field(() => Int, { nullable: true })
  @ApiProperty({
    description: "Timeout in milliseconds (default: 30000)",
    example: 60000,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  timeout?: number;
}
