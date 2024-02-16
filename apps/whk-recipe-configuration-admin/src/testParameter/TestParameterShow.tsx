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

import { BOM_TITLE_FIELD } from "../bom/BomTitle";
import { OPERATION_TITLE_FIELD } from "../operation/OperationTitle";
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
        <BooleanField label="Is Definition" source="isDefinition" />
        <TextField label="Name" source="name" />
        <TextField label="Schema Version" source="schemaVersion" />
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
        <ReferenceManyField
          reference="EquipmentPhase"
          target="testParameterId"
          label="EquipmentPhases"
        >
          <Datagrid rowClick="show">
            <ReferenceField label="Bom" source="bom.id" reference="Bom">
              <TextField source={BOM_TITLE_FIELD} />
            </ReferenceField>
            <TextField label="Class Name" source="className" />
            <DateField source="createdAt" label="Created At" />
            <TextField label="Created By" source="createdBy" />
            <TextField label="Description" source="description" />
            <DateField source="editedAt" label="Edited At" />
            <TextField label="Edited By" source="editedBy" />
            <TextField label="ID" source="id" />
            <BooleanField
              label="Is Class Definition"
              source="isClassDefinition"
            />
            <TextField label="Name" source="name" />
            <ReferenceField
              label="Operation"
              source="operation.id"
              reference="Operation"
            >
              <TextField source={OPERATION_TITLE_FIELD} />
            </ReferenceField>
            <BooleanField
              label="Operation Sequence Index"
              source="operationSequenceIndex"
            />
            <TextField
              label="Operation Step Sequence"
              source="operationStepSequence"
            />
            <TextField label="Revision" source="revision" />
            <TextField label="Schema Version" source="schemaVersion" />
            <ReferenceField
              label="Test Parameters"
              source="testparameter.id"
              reference="TestParameter"
            >
              <TextField source={TESTPARAMETER_TITLE_FIELD} />
            </ReferenceField>
          </Datagrid>
        </ReferenceManyField>
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
            <BooleanField label="Is Definition" source="isDefinition" />
            <TextField label="Name" source="name" />
            <TextField label="Schema Version" source="schemaVersion" />
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
        </ReferenceManyField>
      </SimpleShowLayout>
    </Show>
  );
};
