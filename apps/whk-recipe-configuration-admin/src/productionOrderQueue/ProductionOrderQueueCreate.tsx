import * as React from "react";

import {
  Create,
  SimpleForm,
  CreateProps,
  TextInput,
  BooleanInput,
  ReferenceInput,
  SelectInput,
  NumberInput,
} from "react-admin";

import { ProcedureTitle } from "../procedure/ProcedureTitle";

export const ProductionOrderQueueCreate = (
  props: CreateProps
): React.ReactElement => {
  return (
    <Create {...props}>
      <SimpleForm>
        <TextInput label="Account ID" source="accountId" />
        <BooleanInput label="Active" source="active" />
        <TextInput label="Created By" source="createdBy" />
        <ReferenceInput
          source="procedure.id"
          reference="Procedure"
          label="Procedure"
        >
          <SelectInput optionText={ProcedureTitle} />
        </ReferenceInput>
        <NumberInput step={1} label="Queue Index" source="queueIndex" />
        <NumberInput step={1} label="Revision" source="revision" />
        <TextInput label="Sales Order ID" source="salesOrderId" />
        <TextInput label="Schema Version" source="schemaVersion" />
        <TextInput label="Updated By" source="updatedBy" />
      </SimpleForm>
    </Create>
  );
};
