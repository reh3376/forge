import * as React from "react";

import {
  Create,
  SimpleForm,
  CreateProps,
  BooleanInput,
  TextInput,
  ReferenceInput,
  SelectInput,
  ReferenceArrayInput,
  SelectArrayInput,
  NumberInput,
} from "react-admin";

import { RecipeParameterTitle } from "./RecipeParameterTitle";

export const RecipeParameterCreate = (
  props: CreateProps
): React.ReactElement => {
  return (
    <Create {...props}>
      <SimpleForm>
        <BooleanInput label="Active" source="active" />
        <TextInput label="Batch" source="batch" />
        <ReferenceInput
          source="classId.id"
          reference="RecipeParameter"
          label="Class ID"
        >
          <SelectInput optionText={RecipeParameterTitle} />
        </ReferenceInput>
        <TextInput label="Class Name" source="className" />
        <TextInput label="Created By" source="createdBy" />
        <TextInput label="Edited By" source="editedBy" />
        <BooleanInput label="Is Class Definition" source="isClassDefinition" />
        <TextInput label="Item ID" source="itemId" />
        <TextInput
          label="Recipe Param Description"
          source="recipeParamDescription"
        />
        <ReferenceArrayInput
          source="recipeParameters"
          reference="RecipeParameter"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={RecipeParameterTitle} />
        </ReferenceArrayInput>
        <TextInput label="Recipe Param Name" source="recipeParamName" />
        <TextInput label="Recipe Param Revision" source="recipeParamRevision" />
        <SelectInput
          source="recipeParamUnits"
          label="Recipe Param Units"
          choices={[
            { label: "Lbs", value: "Lbs" },
            { label: "Gal", value: "Gal" },
            { label: "Percentage", value: "Percentage" },
            { label: "Pass-Fail", value: "PassFail" },
            { label: "Seconds", value: "Seconds" },
            { label: "Minutes", value: "Minutes" },
            { label: "DateTime", value: "DateTime" },
            { label: "Feet", value: "Feet" },
            { label: "Bushels", value: "Bushels" },
          ]}
          optionText="label"
          allowEmpty
          optionValue="value"
        />
        <BooleanInput
          label="Recipe Setpoint Boolean Value"
          source="recipeSetpointBooleanValue"
        />
        <NumberInput
          label="Recipe Setpoint Lower Limit"
          source="recipeSetpointLowerLimit"
        />
        <SelectInput
          source="recipeSetpointType"
          label="Recipe Setpoint Type"
          choices={[
            { label: "Boolean", value: "Boolean" },
            { label: "Numeric", value: "Numeric" },
          ]}
          optionText="label"
          optionValue="value"
        />
        <NumberInput
          label="Recipe Setpoint Upper Limit"
          source="recipeSetpointUpperLimit"
        />
        <TextInput label="Schema Version" source="schemaVersion" />
        <div />
      </SimpleForm>
    </Create>
  );
};
