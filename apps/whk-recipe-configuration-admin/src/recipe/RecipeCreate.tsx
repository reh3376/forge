import * as React from "react";

import {
  Create,
  SimpleForm,
  CreateProps,
  BooleanInput,
  TextInput,
  ReferenceInput,
  SelectInput,
  NumberInput,
  ReferenceArrayInput,
  SelectArrayInput,
} from "react-admin";

import { RecipeGroupTitle } from "../recipeGroup/RecipeGroupTitle";
import { UnitProcedureTitle } from "../unitProcedure/UnitProcedureTitle";

export const RecipeCreate = (props: CreateProps): React.ReactElement => {
  return (
    <Create {...props}>
      <SimpleForm>
        <BooleanInput label="Active" source="active" />
        <TextInput label="Created By" source="createdBy" />
        <TextInput label="Customer ID" source="customerId" />
        <TextInput
          label="Item Description"
          multiline
          source="itemDescription"
        />
        <TextInput label="Item ID" source="itemId" />
        <TextInput label="Recipe" source="Recipe" />
        <ReferenceInput
          source="recipeGroup.id"
          reference="RecipeGroup"
          label="Recipe Group"
        >
          <SelectInput optionText={RecipeGroupTitle} />
        </ReferenceInput>
        <NumberInput step={1} label="Revision" source="revision" />
        <TextInput label="Schema Version" source="schemaVersion" />
        <ReferenceArrayInput
          source="unitProcedures"
          reference="UnitProcedure"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={UnitProcedureTitle} />
        </ReferenceArrayInput>
        <TextInput label="Updated By" source="updatedBy" />
      </SimpleForm>
    </Create>
  );
};
