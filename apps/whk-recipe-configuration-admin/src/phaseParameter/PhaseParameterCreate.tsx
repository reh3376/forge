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

import { PhaseParameterTitle } from "./PhaseParameterTitle";
import { EquipmentPhaseTitle } from "../equipmentPhase/EquipmentPhaseTitle";

export const PhaseParameterCreate = (
  props: CreateProps
): React.ReactElement => {
  return (
    <Create {...props}>
      <SimpleForm>
        <BooleanInput label="Active" source="active" />
        <ReferenceInput
          source="classId.id"
          reference="PhaseParameter"
          label="Class"
        >
          <SelectInput optionText={PhaseParameterTitle} />
        </ReferenceInput>
        <TextInput label="Created By" source="createdBy" />
        <TextInput label="Description" multiline source="description" />
        <TextInput label="Edited By" source="editedBy" />
        <ReferenceInput
          source="equipmentPhase.id"
          reference="EquipmentPhase"
          label="Equipment Phase"
        >
          <SelectInput optionText={EquipmentPhaseTitle} />
        </ReferenceInput>
        <ReferenceArrayInput
          source="instances"
          reference="PhaseParameter"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={PhaseParameterTitle} />
        </ReferenceArrayInput>
        <BooleanInput label="Is Class Def" source="isClassDef" />
        <TextInput label="Item ID" source="itemId" />
        <TextInput label="Name" source="name" />
        <TextInput label="Recipe ID" source="recipeId" />
        <NumberInput step={1} label="Revision" source="revision" />
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
        <TextInput label="Units" source="units" />
      </SimpleForm>
    </Create>
  );
};
