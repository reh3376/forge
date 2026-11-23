import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsOptional, IsEnum } from "class-validator";
import { EnumEquipmentOperationalState } from "@prisma/client";

export class TransitionStateDto {
  @ApiProperty({
    description: "Target operational state",
    enum: EnumEquipmentOperationalState,
  })
  @IsEnum(EnumEquipmentOperationalState)
  targetState!: EnumEquipmentOperationalState;

  @ApiProperty({ description: "User or system triggering the transition" })
  @IsString()
  triggeredBy!: string;

  @ApiPropertyOptional({ description: "Notes about the transition" })
  @IsOptional()
  @IsString()
  notes?: string;
}
