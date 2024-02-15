import * as React from "react";
import {
  List,
  Datagrid,
  ListProps,
  BooleanField,
  TextField,
  DateField,
} from "react-admin";
import Pagination from "../Components/Pagination";

export const TestParameterList = (props: ListProps): React.ReactElement => {
  return (
    <List
      {...props}
      bulkActionButtons={false}
      title={"TestParameters"}
      perPage={50}
      pagination={<Pagination />}
    >
      <Datagrid rowClick="show">
        <BooleanField label="Active" source="active" />
        <TextField label="Batch" source="batch" />
        <TextField label="Class Name" source="className" />
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <DateField source="editedAt" label="Edited At" />
        <TextField label="Edited By" source="editedBy" />
        <TextField label="ID" source="id" />
        <BooleanField label="Is Definition" source="isDefinition" />
        <TextField label="Item ID" source="itemId" />
        <TextField label="Schema Version" source="schemaVersion" />
        <TextField label="Test" source="test" />
        <TextField
          label="Test Param Description"
          source="testParamDescription"
        />
        <TextField label="Test Param Name" source="testParamName" />
        <TextField label="Test Param Revision" source="testParamRevision" />
        <TextField label="Test Param Units" source="testParamUnits" />
        <BooleanField label="Test Pass" source="testPass" />
        <TextField label="Test Result" source="testResult" />
        <BooleanField
          label="Test Setpoint Boolean Value"
          source="testSetpointBooleanValue"
        />
        <TextField
          label="Test Setpoint Lower Limit"
          source="testSetpointLowerLimit"
        />
        <TextField label="Test Setpoint Type" source="testSetpointType" />
        <TextField
          label="Test Setpoint Upper Limit"
          source="testSetpointUpperLimit"
        />
        <TextField
          label="Test Setpoint Numerical Value"
          source="testSetpointValue"
        />
      </Datagrid>
    </List>
  );
};
