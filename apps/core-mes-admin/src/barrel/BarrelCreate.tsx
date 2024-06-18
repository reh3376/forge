import * as React from "react";

import {
  Create,
  SimpleForm,
  CreateProps,
  TextInput,
  DateTimeInput,
  ReferenceInput,
  SelectInput,
} from "react-admin";

import { LotTitle } from "../lot/LotTitle";

export const BarrelCreate = (props: CreateProps): React.ReactElement => {
  return (
    <Create {...props}>
      <SimpleForm>
        <TextInput label="Created By" source="createdBy" />
        <DateTimeInput label="Filled At" source="filledAt" />
        <TextInput label="Filled By" source="filledBy" />
        <ReferenceInput source="lot.id" reference="Lot" label="Lot">
          <SelectInput optionText={LotTitle} />
        </ReferenceInput>
        <TextInput label="SerialNumber" source="serialNumber" />
        <TextInput label="Updated By" source="updatedBy" />
      </SimpleForm>
    </Create>
  );
};
