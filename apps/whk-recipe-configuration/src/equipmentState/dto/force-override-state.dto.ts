import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsEnum, MinLength } from "class-validator";
import { EnumEquipmentOperationalState } from "@prisma/client";

export class ForceOverrideStateDto {
  @ApiProperty({
    description: "Target operational state (any state, no validation)",
    enum: EnumEquipmentOperationalState,
  })
  @IsEnum(EnumEquipmentOperationalState)
  targetState!: EnumEquipmentOperationalState;

  @ApiProperty({ description: "User performing the override" })
  @IsString()
  triggeredBy!: string;

  @ApiProperty({ description: "Reason for the override (required)" })
  @IsString()
  @MinLength(3, { message: "Reason must be at least 3 characters" })
  reason!: string;
}
