import * as React from "react";

import {
  Create,
  SimpleForm,
  CreateProps,
  BooleanInput,
  TextInput,
  ReferenceArrayInput,
  SelectArrayInput,
  SelectInput,
  NumberInput,
} from "react-admin";

import { EquipmentPhaseTitle } from "../equipmentPhase/EquipmentPhaseTitle";

export const TestParameterCreate = (props: CreateProps): React.ReactElement => {
  return (
    <Create {...props}>
      <SimpleForm>
        <BooleanInput label="Active" source="active" />
        <TextInput label="Batch" source="batch" />
        <TextInput label="Class Name" source="className" />
        <TextInput label="Created By" source="createdBy" />
        <TextInput label="Edited By" source="editedBy" />
        <ReferenceArrayInput
          source="equipmentPhases"
          reference="EquipmentPhase"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={EquipmentPhaseTitle} />
        </ReferenceArrayInput>
        <BooleanInput label="Is Definition" source="isDefinition" />
        <TextInput label="Item ID" source="itemId" />
        <TextInput label="Schema Version" source="schemaVersion" />
        <div />
        <TextInput
          label="Test Param Description"
          source="testParamDescription"
        />
        <TextInput label="Test Param Name" source="testParamName" />
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
        <TextInput label="Test Result" source="testResult" />
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
      </SimpleForm>
    </Create>
  );
};
