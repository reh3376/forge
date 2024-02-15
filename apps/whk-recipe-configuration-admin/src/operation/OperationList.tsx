import * as React from "react";
import {
  List,
  Datagrid,
  ListProps,
  BooleanField,
  DateField,
  TextField,
} from "react-admin";
import Pagination from "../Components/Pagination";

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
      </Datagrid>
    </List>
  );
};
