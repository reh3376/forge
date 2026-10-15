import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsOptional } from "class-validator";

export class AssignFermenterDto {
  @ApiProperty({ description: "Asset ID of the fermenter to assign" })
  @IsString()
  assetId!: string;

  @ApiProperty({ description: "Schedule order ID to assign" })
  @IsString()
  scheduleOrderId!: string;

  @ApiProperty({ description: "User making the assignment" })
  @IsString()
  assignedBy!: string;

  @ApiPropertyOptional({ description: "Notes about the assignment" })
  @IsOptional()
  @IsString()
  notes?: string;
}
