import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsOptional, IsBoolean } from "class-validator";

export class ReleaseFermenterDto {
  @ApiProperty({ description: "User releasing the fermenter" })
  @IsString()
  releasedBy!: string;

  @ApiPropertyOptional({
    description: "Send to CIP after release (default true)",
  })
  @IsOptional()
  @IsBoolean()
  sendToCip?: boolean;

  @ApiPropertyOptional({ description: "Notes about the release" })
  @IsOptional()
  @IsString()
  notes?: string;
}
