import * as React from "react";

import {
  List,
  Datagrid,
  ListProps,
  TextField,
  DateField,
  ReferenceField,
  BooleanField,
} from "react-admin";

import Pagination from "../Components/Pagination";
import { OPERATION_TITLE_FIELD } from "../operation/OperationTitle";

export const OperationStepList = (props: ListProps): React.ReactElement => {
  return (
    <List
      {...props}
      bulkActionButtons={false}
      title={"OperationSteps"}
      perPage={50}
      pagination={<Pagination />}
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
        <BooleanField label="Sequence Operation" source="sequenceOperation" />
        <TextField label="Tests" source="tests" />
      </Datagrid>
    </List>
  );
};
