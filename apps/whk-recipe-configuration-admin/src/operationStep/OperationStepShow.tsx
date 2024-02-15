import * as React from "react";

import {
  Show,
  SimpleShowLayout,
  ShowProps,
  TextField,
  DateField,
  ReferenceField,
  BooleanField,
} from "react-admin";

import { OPERATION_TITLE_FIELD } from "../operation/OperationTitle";

export const OperationStepShow = (props: ShowProps): React.ReactElement => {
  return (
    <Show {...props}>
      <SimpleShowLayout>
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
        <BooleanField label="Sequence Operation" source="sequenceOperation" />
        <TextField label="Tests" source="tests" />
      </SimpleShowLayout>
    </Show>
  );
};
