import * as React from "react";

import {
  Create,
  SimpleForm,
  CreateProps,
  BooleanInput,
  ReferenceInput,
  SelectInput,
  TextInput,
  ReferenceArrayInput,
  SelectArrayInput,
  NumberInput,
} from "react-admin";

import { TestParameterTitle } from "./TestParameterTitle";
import { EquipmentPhaseTitle } from "../equipmentPhase/EquipmentPhaseTitle";

export const TestParameterCreate = (props: CreateProps): React.ReactElement => {
  return (
    <Create {...props}>
      <SimpleForm>
        <BooleanInput label="Active" source="active" />
        <ReferenceInput
          source="classId.id"
          reference="TestParameter"
          label="Class"
        >
          <SelectInput optionText={TestParameterTitle} />
        </ReferenceInput>
        <TextInput label="Created By" source="createdBy" />
        <TextInput label="Description" source="description" />
        <TextInput label="Edited By" source="editedBy" />
        <ReferenceArrayInput
          source="equipmentPhases"
          reference="EquipmentPhase"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={EquipmentPhaseTitle} />
        </ReferenceArrayInput>
        <ReferenceArrayInput
          source="instances"
          reference="TestParameter"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={TestParameterTitle} />
        </ReferenceArrayInput>
        <BooleanInput label="Is Class Def" source="isClassDef" />
        <TextInput label="Name" source="name" />
        <TextInput label="Schema Version" source="schemaVersion" />
        <TextInput label="TestDetails" multiline source="testDetails" />
        <TextInput label="Test Param Revision" source="testParamRevision" />
        <SelectInput
          source="testParamUnits"
          label="Test Param Units"
          choices={[
            { label: "Lbs", value: "Lbs" },
            { label: "Percentage", value: "Perc" },
            { label: "Gal", value: "Gal" },
            { label: "Bu", value: "Bu" },
            { label: "Pass-Fail", value: "PassFail" },
          ]}
          optionText="label"
          allowEmpty
          optionValue="value"
        />
        <BooleanInput label="Test Pass" source="testPass" />
        <div />
        <BooleanInput
          label="Test Setpoint Boolean Value"
          source="testSetpointBooleanValue"
        />
        <NumberInput
          label="Test Setpoint Lower Limit"
          source="testSetpointLowerLimit"
        />
        <SelectInput
          source="testSetpointType"
          label="Test Setpoint Type"
          choices={[
            { label: "Boolean", value: "Boolean" },
            { label: "Numerical", value: "Numerical" },
          ]}
          optionText="label"
          allowEmpty
          optionValue="value"
        />
        <NumberInput
          label="Test Setpoint Upper Limit"
          source="testSetpointUpperLimit"
        />
        <NumberInput
          label="Test Setpoint Numerical Value"
          source="testSetpointValue"
        />
        <TextInput label="Tooltip" source="tooltip" />
      </SimpleForm>
    </Create>
  );
};
