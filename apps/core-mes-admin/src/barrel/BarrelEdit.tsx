import * as React from "react";

import {
  Edit,
  SimpleForm,
  EditProps,
  TextInput,
  DateTimeInput,
  ReferenceInput,
  SelectInput,
} from "react-admin";

import { LotTitle } from "../lot/LotTitle";

export const BarrelEdit = (props: EditProps): React.ReactElement => {
  return (
    <Edit {...props}>
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
    </Edit>
  );
};
