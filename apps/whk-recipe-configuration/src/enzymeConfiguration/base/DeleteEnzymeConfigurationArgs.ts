import { ArgsType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { EnzymeConfigurationWhereUniqueInput } from "./EnzymeConfigurationWhereUniqueInput";
import { ValidateNested } from "class-validator";
import { Type } from "class-transformer";

@ArgsType()
class DeleteEnzymeConfigurationArgs {
  @ApiProperty({
    required: true,
    type: () => EnzymeConfigurationWhereUniqueInput,
  })
  @ValidateNested()
  @Type(() => EnzymeConfigurationWhereUniqueInput)
  @Field(() => EnzymeConfigurationWhereUniqueInput, { nullable: false })
  where!: EnzymeConfigurationWhereUniqueInput;
}

export { DeleteEnzymeConfigurationArgs as DeleteEnzymeConfigurationArgs };
