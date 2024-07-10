import { ArgsType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional } from "class-validator";
import GraphQLJSON from "graphql-type-json";
import { InputJsonValue } from "src/types";
import { IsJSONValue } from "src/validators";

@ArgsType()
class BatchIdCreateInput {
    @Field(() => String)
    @ApiProperty({
        required: true,
        type: () => String
    })
    @Type(() => String)
    operation!: string;

    @ApiProperty({
        required: false,
    })
    @IsJSONValue()
    @IsOptional()
    @Field(() => GraphQLJSON, {
        nullable: true,
    })
    batchData?: InputJsonValue;

    @ApiProperty({
        required: false,
    })
    @IsJSONValue()
    @IsOptional()
    @Field(() => GraphQLJSON, {
        nullable: true,
    })
    parameterData?: InputJsonValue;

    @Field(() => String)
    @ApiProperty({
        required: true,
        type: () => String
    })
    @Type(() => String)
    createdBy!: string;
}

export { BatchIdCreateInput as BatchIdCreateInput };