import { ArgsType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { EnzymeConfigurationCreateInput } from "./EnzymeConfigurationCreateInput";
import { ValidateNested } from "class-validator";
import { Type } from "class-transformer";

@ArgsType()
class CreateEnzymeConfigurationArgs {
  @ApiProperty({
    required: true,
    type: () => EnzymeConfigurationCreateInput,
  })
  @ValidateNested()
  @Type(() => EnzymeConfigurationCreateInput)
  @Field(() => EnzymeConfigurationCreateInput, { nullable: false })
  data!: EnzymeConfigurationCreateInput;
}

export { CreateEnzymeConfigurationArgs as CreateEnzymeConfigurationArgs };
