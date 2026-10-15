import { ApiProperty, PartialType } from "@nestjs/swagger";
import { IsString, IsOptional, IsNotEmpty } from "class-validator";
import { CreateEnzymeConfigurationDto } from "./create-enzyme-configuration.dto";

export class UpdateEnzymeConfigurationDto extends PartialType(
  CreateEnzymeConfigurationDto
) {
  @ApiProperty({
    required: false,
    description: "Username of the updater",
    example: "jane.doe",
  })
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  updatedBy?: string;
}
