import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsOptional, IsEnum } from "class-validator";
import { EnumFermenterAssignmentStatus } from "@prisma/client";

export class UpdateAssignmentStatusDto {
  @ApiProperty({
    description: "New assignment status",
    enum: EnumFermenterAssignmentStatus,
  })
  @IsEnum(EnumFermenterAssignmentStatus)
  status!: EnumFermenterAssignmentStatus;

  @ApiProperty({ description: "User triggering the status change" })
  @IsString()
  triggeredBy!: string;

  @ApiPropertyOptional({ description: "Notes about the status change" })
  @IsOptional()
  @IsString()
  notes?: string;
}
