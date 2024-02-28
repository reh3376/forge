import * as React from "react";

import {
  Show,
  SimpleShowLayout,
  ShowProps,
  TextField,
  BooleanField,
  DateField,
  ReferenceField,
} from "react-admin";

import { PROCEDURE_TITLE_FIELD } from "../procedure/ProcedureTitle";

export const ProductionOrderQueueShow = (
  props: ShowProps
): React.ReactElement => {
  return (
    <Show {...props}>
      <SimpleShowLayout>
        <TextField label="Account ID" source="accountId" />
        <BooleanField label="Active" source="active" />
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <TextField label="ID" source="id" />
        <ReferenceField
          label="Procedure"
          source="procedure.id"
          reference="Procedure"
        >
          <TextField source={PROCEDURE_TITLE_FIELD} />
        </ReferenceField>
        <TextField label="Queue Index" source="queueIndex" />
        <TextField label="Revision" source="revision" />
        <TextField label="Sales Order ID" source="salesOrderId" />
        <TextField label="Schema Version" source="schemaVersion" />
        <DateField source="updatedAt" label="Updated At" />
        <TextField label="Updated By" source="updatedBy" />
      </SimpleShowLayout>
    </Show>
  );
};
