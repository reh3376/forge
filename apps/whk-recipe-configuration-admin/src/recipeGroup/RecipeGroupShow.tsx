import * as React from "react";

import {
  Show,
  SimpleShowLayout,
  ShowProps,
  DateField,
  TextField,
  ReferenceManyField,
  Datagrid,
  BooleanField,
  ReferenceField,
} from "react-admin";

import { RECIPEGROUP_TITLE_FIELD } from "./RecipeGroupTitle";

export const RecipeGroupShow = (props: ShowProps): React.ReactElement => {
  return (
    <Show {...props}>
      <SimpleShowLayout>
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <TextField label="ID" source="id" />
        <TextField label="Recipe" source="recipe" />
        <TextField label="Revision" source="revision" />
        <TextField label="Schema Version" source="schemaVersion" />
        <DateField source="updatedAt" label="Updated At" />
        <TextField label="Updated By" source="updatedBy" />
        <ReferenceManyField
          reference="Recipe"
          target="recipeGroupId"
          label="Recipes"
        >
          <Datagrid rowClick="show">
            <BooleanField label="Active" source="active" />
            <DateField source="createdAt" label="Created At" />
            <TextField label="Created By" source="createdBy" />
            <TextField label="Customer ID" source="customerId" />
            <TextField label="ID" source="id" />
            <TextField label="Item Description" source="itemDescription" />
            <TextField label="Item ID" source="itemId" />
            <TextField label="Recipe" source="Recipe" />
            <ReferenceField
              label="Recipe Group"
              source="recipegroup.id"
              reference="RecipeGroup"
            >
              <TextField source={RECIPEGROUP_TITLE_FIELD} />
            </ReferenceField>
            <TextField label="Revision" source="revision" />
            <TextField label="Schema Version" source="schemaVersion" />
            <DateField source="updatedAt" label="Updated At" />
            <TextField label="Updated By" source="updatedBy" />
          </Datagrid>
        </ReferenceManyField>
      </SimpleShowLayout>
    </Show>
  );
};
