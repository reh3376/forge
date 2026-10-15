import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
} from "class-validator";
import { ChangeoverState } from "../changeover.types";

export class ChangeoverRequestDto {
  @ApiProperty({ description: "User requesting changeover" })
  @IsString()
  requestedBy!: string;

  @ApiPropertyOptional({
    description: "Force changeover even if cooks are not complete",
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ApiPropertyOptional({ description: "Reason for changeover request" })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: "Additional notes" })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CipCompleteDto {
  @ApiProperty({ description: "CIP start time (ISO-8601)" })
  @IsString()
  cipStartTime!: string;

  @ApiProperty({ description: "CIP end time (ISO-8601)" })
  @IsString()
  cipEndTime!: string;

  @ApiPropertyOptional({ description: "CIP duration in seconds" })
  @IsOptional()
  @IsNumber()
  cipDurationSeconds?: number;

  @ApiPropertyOptional({ description: "User who reported CIP completion" })
  @IsOptional()
  @IsString()
  reportedBy?: string;
}

export class RecipeLoadedDto {
  @ApiProperty({ description: "Schedule order recipe instance ID" })
  @IsString()
  scheduleOrderRecipeInstanceId!: string;

  @ApiProperty({
    description: "Recipe instance updatedAt at time of read, for version check",
  })
  @IsString()
  sourceUpdatedAt!: string;

  @ApiProperty({ description: "Cooker number where recipe was loaded" })
  @IsString()
  cookerNumber!: string;

  @ApiPropertyOptional({ description: "User who loaded the recipe" })
  @IsOptional()
  @IsString()
  loadedBy?: string;
}

export class StartProductionDto {
  @ApiProperty({ description: "User starting production" })
  @IsString()
  startedBy!: string;

  @ApiPropertyOptional({ description: "Additional notes" })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ResetErrorDto {
  @ApiProperty({
    description: "Target state to reset to",
    enum: [ChangeoverState.AWAITING_CHANGEOVER, ChangeoverState.CIP_COMPLETE],
  })
  @IsEnum(ChangeoverState)
  targetState!: ChangeoverState;

  @ApiProperty({ description: "User performing the reset" })
  @IsString()
  resetBy!: string;

  @ApiPropertyOptional({ description: "Reason for reset" })
  @IsOptional()
  @IsString()
  reason?: string;
}
