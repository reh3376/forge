import { InputType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { VendorWhereUniqueInput } from "./VendorWhereUniqueInput";

@InputType()
class VendorWhereConnectUniqueInput {
  @Field(() => VendorWhereUniqueInput, {
    nullable: true,
  })
  @ApiProperty({
    required: false,
    type: () => VendorWhereUniqueInput,
  })
  @Expose()
  connect?: VendorWhereUniqueInput;
}

export { VendorWhereConnectUniqueInput as VendorWhereConnectUniqueInput };
