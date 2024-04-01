import * as React from "react";

import {
  Create,
  SimpleForm,
  CreateProps,
  TextInput,
  ReferenceArrayInput,
  SelectArrayInput,
  NumberInput,
} from "react-admin";

import { RecipeTitle } from "../recipe/RecipeTitle";

export const RecipeGroupCreate = (props: CreateProps): React.ReactElement => {
  return (
    <Create {...props}>
      <SimpleForm>
        <TextInput label="Created By" source="createdBy" />
        <TextInput label="Recipe" source="recipe" />
        <ReferenceArrayInput
          source="recipes"
          reference="Recipe"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={RecipeTitle} />
        </ReferenceArrayInput>
        <NumberInput step={1} label="Revision" source="revision" />
        <TextInput label="Schema Version" source="schemaVersion" />
        <TextInput label="Updated By" source="updatedBy" />
      </SimpleForm>
    </Create>
  );
};
