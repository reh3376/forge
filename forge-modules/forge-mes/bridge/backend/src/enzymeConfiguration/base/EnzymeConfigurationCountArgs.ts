import { ArgsType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { EnzymeConfigurationWhereInput } from "./EnzymeConfigurationWhereInput";
import { IsOptional, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

@ArgsType()
class EnzymeConfigurationCountArgs {
  @ApiProperty({
    required: false,
    type: () => EnzymeConfigurationWhereInput,
  })
  @IsOptional()
  @ValidateNested()
  @Field(() => EnzymeConfigurationWhereInput, { nullable: true })
  @Type(() => EnzymeConfigurationWhereInput)
  where?: EnzymeConfigurationWhereInput;
}

export { EnzymeConfigurationCountArgs as EnzymeConfigurationCountArgs };
