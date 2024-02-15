import * as React from "react";

import {
  Create,
  SimpleForm,
  CreateProps,
  TextInput,
  ReferenceInput,
  SelectInput,
  BooleanInput,
  NumberInput,
} from "react-admin";

import { EquipmentPhaseTitle } from "../equipmentPhase/EquipmentPhaseTitle";

export const PhaseParameterCreate = (
  props: CreateProps
): React.ReactElement => {
  return (
    <Create {...props}>
      <SimpleForm>
        <TextInput label="Created By" source="createdBy" />
        <TextInput label="Edited By" source="editedBy" />
        <ReferenceInput
          source="equipmentPhase.id"
          reference="EquipmentPhase"
          label="Equipment Phase"
        >
          <SelectInput optionText={EquipmentPhaseTitle} />
        </ReferenceInput>
        <TextInput label="Item ID" source="itemId" />
        <TextInput label="Recipe ID" source="recipeId" />
        <TextInput label="Schema Version" source="schemaVersion" />
        <BooleanInput
          label="Setpoint Boolean Value"
          source="setpointBooleanValue"
        />
        <NumberInput label="Setpoint Lower Limit" source="setpointLowerLimit" />
        <NumberInput
          label="Setpoint Numerical Value"
          source="setpointNumericalValue"
        />
        <SelectInput
          source="setpointType"
          label="Setpoint Type"
          choices={[
            { label: "Boolean", value: "Boolean" },
            { label: "Numeric", value: "Numeric" },
          ]}
          optionText="label"
          optionValue="value"
        />
        <NumberInput label="Setpoint Upper Limit" source="setpointUpperLimit" />
        <TextInput
          label="Type Description"
          multiline
          source="typeDescription"
        />
        <TextInput label="Type Name" source="typeName" />
        <NumberInput step={1} label="Type Revision" source="typeRevision" />
        <TextInput label="Type Units" source="typeUnits" />
      </SimpleForm>
    </Create>
  );
};
