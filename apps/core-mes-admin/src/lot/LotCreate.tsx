import * as React from "react";

import {
  Create,
  SimpleForm,
  CreateProps,
  ReferenceArrayInput,
  SelectArrayInput,
  TextInput,
} from "react-admin";

import { BarrelTitle } from "../barrel/BarrelTitle";

export const LotCreate = (props: CreateProps): React.ReactElement => {
  return (
    <Create {...props}>
      <SimpleForm>
        <ReferenceArrayInput
          source="barrels"
          reference="Barrel"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={BarrelTitle} />
        </ReferenceArrayInput>
        <TextInput label="CreatedBy" source="createdBy" />
        <TextInput label="Item" source="item" />
        <TextInput
          label="Purchase Order Loaded In"
          source="purchaseOrderLoadedIn"
        />
        <TextInput
          label="Purchase Order Rejected Lot"
          source="purchaseOrderRejectedLot"
        />
        <TextInput label="UpdatedBy" source="updatedBy" />
      </SimpleForm>
    </Create>
  );
};
