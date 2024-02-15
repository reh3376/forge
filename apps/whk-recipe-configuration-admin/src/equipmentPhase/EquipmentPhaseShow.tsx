import * as React from "react";

import {
  Show,
  SimpleShowLayout,
  ShowProps,
  TextField,
  DateField,
  BooleanField,
  ReferenceField,
  ReferenceManyField,
  Datagrid,
} from "react-admin";

import { EQUIPMENTPHASE_TITLE_FIELD } from "./EquipmentPhaseTitle";
import { OPERATION_TITLE_FIELD } from "../operation/OperationTitle";
import { TESTPARAMETER_TITLE_FIELD } from "../testParameter/TestParameterTitle";

export const EquipmentPhaseShow = (props: ShowProps): React.ReactElement => {
  return (
    <Show {...props}>
      <SimpleShowLayout>
        <TextField label="Bom ID" source="bomId" />
        <TextField label="Class Name" source="className" />
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <TextField label="Description" source="description" />
        <DateField source="editedAt" label="Edited At" />
        <TextField label="Edited By" source="editedBy" />
        <TextField label="ID" source="id" />
        <BooleanField label="Is Class Definition" source="isClassDefinition" />
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
        <ReferenceManyField
          reference="PhaseParameter"
          target="equipmentPhaseId"
          label="Phase Parameter"
        >
          <Datagrid rowClick="show">
            <DateField source="createdAt" label="Created At" />
            <TextField label="Created By" source="createdBy" />
            <TextField label="Edited By" source="editedBy" />
            <ReferenceField
              label="Equipment Phase"
              source="equipmentphase.id"
              reference="EquipmentPhase"
            >
              <TextField source={EQUIPMENTPHASE_TITLE_FIELD} />
            </ReferenceField>
            <TextField label="ID" source="id" />
            <TextField label="Item ID" source="itemId" />
            <TextField label="Recipe ID" source="recipeId" />
            <TextField label="Schema Version" source="schemaVersion" />
            <BooleanField
              label="Setpoint Boolean Value"
              source="setpointBooleanValue"
            />
            <TextField
              label="Setpoint Lower Limit"
              source="setpointLowerLimit"
            />
            <TextField
              label="Setpoint Numerical Value"
              source="setpointNumericalValue"
            />
            <TextField label="Setpoint Type" source="setpointType" />
            <TextField
              label="Setpoint Upper Limit"
              source="setpointUpperLimit"
            />
            <TextField label="Type Description" source="typeDescription" />
            <TextField label="Type Name" source="typeName" />
            <TextField label="Type Revision" source="typeRevision" />
            <TextField label="Type Units" source="typeUnits" />
            <DateField source="updatedAt" label="Updated At" />
          </Datagrid>
        </ReferenceManyField>
      </SimpleShowLayout>
    </Show>
  );
};
