import { ArgsType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional } from "class-validator";
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

    @Field(() => String)
    @ApiProperty({
        required: false,
        type: () => String,
        description: 'JSON string containing batch data'
    })
    @Type(() => String)
    @IsOptional()
    batchData?: string;

    @Field(() => String)
    @IsJSONValue()
    @ApiProperty({
        required: false,
        type: () => String,
        description: 'JSON string containing param data'
    })
    @Type(() => String)
    @IsOptional()
    parameterData?: string;

    @Field(() => String)
    @ApiProperty({
        required: true,
        type: () => String
    })
    @Type(() => String)
    createdBy!: string;
}

export { BatchIdCreateInput as BatchIdCreateInput };