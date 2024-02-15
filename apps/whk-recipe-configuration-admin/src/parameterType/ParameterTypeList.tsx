import * as React from "react";
import {
  List,
  Datagrid,
  ListProps,
  DateField,
  TextField,
  BooleanField,
} from "react-admin";
import Pagination from "../Components/Pagination";

export const ParameterTypeList = (props: ListProps): React.ReactElement => {
  return (
    <List
      {...props}
      bulkActionButtons={false}
      title={"Parameter Types"}
      perPage={50}
      pagination={<Pagination />}
    >
      <Datagrid rowClick="show">
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <TextField label="Edited By" source="editedBy" />
        <TextField label="ID" source="id" />
        <TextField label="Item ID" source="itemId" />
        <TextField label="Recipe ID" source="recipeId" />
        <TextField label="Schema Version" source="schemaVersion" />
        <BooleanField
          label="Setpoint Boolean Value"
          source="setpointBooleanValue"
        />
        <TextField label="Setpoint Lower Limit" source="setpointLowerLimit" />
        <TextField
          label="Setpoint Numerical Value"
          source="setpointNumericalValue"
        />
        <TextField label="Setpoint Type" source="setpointType" />
        <TextField label="Setpoint Upper Limit" source="setpointUpperLimit" />
        <TextField label="Type Description" source="typeDescription" />
        <TextField label="Type Name" source="typeName" />
        <TextField label="Type Revision" source="typeRevision" />
        <TextField label="Type Units" source="typeUnits" />
        <DateField source="updatedAt" label="Updated At" />
      </Datagrid>
    </List>
  );
};
