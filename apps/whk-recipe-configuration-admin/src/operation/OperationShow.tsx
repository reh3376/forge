import * as React from "react";

import {
  Show,
  SimpleShowLayout,
  ShowProps,
  BooleanField,
  DateField,
  TextField,
  ReferenceManyField,
  Datagrid,
  ReferenceField,
} from "react-admin";

import { OPERATION_TITLE_FIELD } from "./OperationTitle";

export const OperationShow = (props: ShowProps): React.ReactElement => {
  return (
    <Show {...props}>
      <SimpleShowLayout>
        <BooleanField label="Active" source="active" />
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <TextField label="Edited By" source="editedBy" />
        <TextField label="globalUuid" source="globalUuid" />
        <TextField label="ID" source="id" />
        <TextField
          label="Operation Description"
          source="operationDescription"
        />
        <TextField label="Operation Name" source="operationName" />
        <TextField label="Operation Revision" source="operationRevision" />
        <TextField
          label="Operation Sequence Number"
          source="operationSequenceNumber"
        />
        <TextField label="Route" source="route" />
        <TextField label="Schema Version" source="schemaVersion" />
        <DateField source="updatedAt" label="Updated At" />
        <ReferenceManyField
          reference="OperationStep"
          target="operationId"
          label="OperationSteps"
        >
          <Datagrid rowClick="show">
            <TextField label="Bom ID" source="bomId" />
            <TextField label="Class Name" source="className" />
            <DateField source="createdAt" label="Created At" />
            <TextField label="Created By" source="createdBy" />
            <DateField source="editedAt" label="Edited At" />
            <TextField label="Edited By" source="editedBy" />
            <TextField label="ID" source="id" />
            <ReferenceField
              label="Operation"
              source="operation.id"
              reference="Operation"
            >
              <TextField source={OPERATION_TITLE_FIELD} />
            </ReferenceField>
            <TextField
              label="Operation Step Description"
              source="operationStepDescription"
            />
            <TextField label="Operation Step Name" source="operationStepName" />
            <TextField
              label="Operation Step Revision"
              source="operationStepRevision"
            />
            <TextField
              label="Operation Step Sequence"
              source="operationStepSequence"
            />
            <TextField label="Recipe ID" source="recipeId" />
            <TextField label="Schema Version" source="schemaVersion" />
            <BooleanField
              label="Sequence Operation"
              source="sequenceOperation"
            />
            <TextField label="Tests" source="tests" />
          </Datagrid>
        </ReferenceManyField>
      </SimpleShowLayout>
    </Show>
  );
};
