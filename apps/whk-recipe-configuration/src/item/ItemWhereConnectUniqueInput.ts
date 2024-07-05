
import { InputType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { ItemWhereUniqueInput } from "./ItemWhereUniqueInput";
import { Expose } from "class-transformer";

@InputType()
class ItemWhereConnectUniqueInput {
  @Field(() => ItemWhereUniqueInput, {
    nullable: true,
  })
  @ApiProperty({
    required: false,
    type: () => ItemWhereUniqueInput,
  })
  @Expose()
  connect?: ItemWhereUniqueInput;
}

export { ItemWhereConnectUniqueInput as ItemWhereConnectUniqueInput };