import { ArgsType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { EnzymeConfigurationWhereInput } from "./EnzymeConfigurationWhereInput";
import { IsOptional, ValidateNested, IsInt } from "class-validator";
import { Type } from "class-transformer";

@ArgsType()
class EnzymeConfigurationFindManyArgs {
  @ApiProperty({
    required: false,
    type: () => EnzymeConfigurationWhereInput,
  })
  @IsOptional()
  @ValidateNested()
  @Field(() => EnzymeConfigurationWhereInput, { nullable: true })
  @Type(() => EnzymeConfigurationWhereInput)
  where?: EnzymeConfigurationWhereInput;

  @ApiProperty({
    required: false,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Field(() => Number, { nullable: true })
  skip?: number;

  @ApiProperty({
    required: false,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Field(() => Number, { nullable: true })
  take?: number;
}

export { EnzymeConfigurationFindManyArgs as EnzymeConfigurationFindManyArgs };
