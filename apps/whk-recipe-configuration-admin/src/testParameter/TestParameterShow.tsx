import * as React from "react";

import {
  Show,
  SimpleShowLayout,
  ShowProps,
  BooleanField,
  ReferenceField,
  TextField,
  DateField,
  ReferenceManyField,
  Datagrid,
} from "react-admin";

import { TESTPARAMETER_TITLE_FIELD } from "./TestParameterTitle";

export const TestParameterShow = (props: ShowProps): React.ReactElement => {
  return (
    <Show {...props}>
      <SimpleShowLayout>
        <BooleanField label="Active" source="active" />
        <ReferenceField
          label="Class"
          source="testparameter.id"
          reference="TestParameter"
        >
          <TextField source={TESTPARAMETER_TITLE_FIELD} />
        </ReferenceField>
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <TextField label="Description" source="description" />
        <DateField source="editedAt" label="Edited At" />
        <TextField label="Edited By" source="editedBy" />
        <TextField label="ID" source="id" />
        <BooleanField label="Is Class Def" source="isClassDef" />
        <TextField label="Name" source="name" />
        <TextField label="Schema Version" source="schemaVersion" />
        <TextField label="TestDetails" source="testDetails" />
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
        <TextField label="Tooltip" source="tooltip" />
        <ReferenceManyField
          reference="TestParameter"
          target="classIdId"
          label="TestParameters"
        >
          <Datagrid rowClick="show">
            <BooleanField label="Active" source="active" />
            <ReferenceField
              label="Class"
              source="testparameter.id"
              reference="TestParameter"
            >
              <TextField source={TESTPARAMETER_TITLE_FIELD} />
            </ReferenceField>
            <DateField source="createdAt" label="Created At" />
            <TextField label="Created By" source="createdBy" />
            <TextField label="Description" source="description" />
            <DateField source="editedAt" label="Edited At" />
            <TextField label="Edited By" source="editedBy" />
            <TextField label="ID" source="id" />
            <BooleanField label="Is Class Def" source="isClassDef" />
            <TextField label="Name" source="name" />
            <TextField label="Schema Version" source="schemaVersion" />
            <TextField label="TestDetails" source="testDetails" />
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
            <TextField label="Tooltip" source="tooltip" />
          </Datagrid>
        </ReferenceManyField>
      </SimpleShowLayout>
    </Show>
  );
};
