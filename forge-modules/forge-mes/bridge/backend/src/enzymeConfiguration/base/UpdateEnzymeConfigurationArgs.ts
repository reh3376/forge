import { ArgsType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { EnzymeConfigurationWhereUniqueInput } from "./EnzymeConfigurationWhereUniqueInput";
import { EnzymeConfigurationUpdateInput } from "./EnzymeConfigurationUpdateInput";
import { ValidateNested } from "class-validator";
import { Type } from "class-transformer";

@ArgsType()
class UpdateEnzymeConfigurationArgs {
  @ApiProperty({
    required: true,
    type: () => EnzymeConfigurationWhereUniqueInput,
  })
  @ValidateNested()
  @Type(() => EnzymeConfigurationWhereUniqueInput)
  @Field(() => EnzymeConfigurationWhereUniqueInput, { nullable: false })
  where!: EnzymeConfigurationWhereUniqueInput;

  @ApiProperty({
    required: true,
    type: () => EnzymeConfigurationUpdateInput,
  })
  @ValidateNested()
  @Type(() => EnzymeConfigurationUpdateInput)
  @Field(() => EnzymeConfigurationUpdateInput, { nullable: false })
  data!: EnzymeConfigurationUpdateInput;
}

export { UpdateEnzymeConfigurationArgs as UpdateEnzymeConfigurationArgs };
