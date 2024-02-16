import * as React from "react";

import {
  List,
  Datagrid,
  ListProps,
  TextField,
  BooleanField,
  ReferenceField,
  DateField,
} from "react-admin";

import Pagination from "../Components/Pagination";
import { OPERATION_TITLE_FIELD } from "./OperationTitle";
import { UNITPROCEDURE_TITLE_FIELD } from "../unitProcedure/UnitProcedureTitle";

export const OperationList = (props: ListProps): React.ReactElement => {
  return (
    <List
      {...props}
      bulkActionButtons={false}
      title={"Operations"}
      perPage={50}
      pagination={<Pagination />}
    >
      <Datagrid rowClick="show">
        <TextField label="Abbreviation" source="abbreviation" />
        <BooleanField label="Active" source="active" />
        <ReferenceField
          label="Class"
          source="operation.id"
          reference="Operation"
        >
          <TextField source={OPERATION_TITLE_FIELD} />
        </ReferenceField>
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <TextField label="Description" source="description" />
        <TextField label="Edited By" source="editedBy" />
        <TextField label="ID" source="id" />
        <BooleanField label="Is Class Definition" source="isClassDefinition" />
        <TextField label="Name" source="name" />
        <TextField label="Path" source="path" />
        <TextField
          label="Procedure Sequence Index"
          source="procedureSequenceIndex"
        />
        <TextField label="Revision" source="revision" />
        <TextField label="Schema Version" source="schemaVersion" />
        <ReferenceField
          label="Unit Procedure"
          source="unitprocedure.id"
          reference="UnitProcedure"
        >
          <TextField source={UNITPROCEDURE_TITLE_FIELD} />
        </ReferenceField>
        <DateField source="updatedAt" label="Updated At" />
      </Datagrid>
    </List>
  );
};
