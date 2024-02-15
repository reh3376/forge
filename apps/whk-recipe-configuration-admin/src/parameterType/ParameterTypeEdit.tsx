import * as React from "react";

import {
  Edit,
  SimpleForm,
  EditProps,
  TextInput,
  ReferenceArrayInput,
  SelectArrayInput,
  BooleanInput,
  NumberInput,
  SelectInput,
} from "react-admin";

import { RecipeParameterTitle } from "../recipeParameter/RecipeParameterTitle";

export const ParameterTypeEdit = (props: EditProps): React.ReactElement => {
  return (
    <Edit {...props}>
      <SimpleForm>
        <TextInput label="Created By" source="createdBy" />
        <TextInput label="Edited By" source="editedBy" />
        <TextInput label="Item ID" source="itemId" />
        <TextInput label="Recipe ID" source="recipeId" />
        <ReferenceArrayInput
          source="recipeParameters"
          reference="RecipeParameter"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={RecipeParameterTitle} />
        </ReferenceArrayInput>
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
    </Edit>
  );
};
