import * as React from "react";

import {
  Show,
  SimpleShowLayout,
  ShowProps,
  BooleanField,
  DateField,
  TextField,
  ReferenceField,
} from "react-admin";

import { RECIPEGROUP_TITLE_FIELD } from "../recipeGroup/RecipeGroupTitle";

export const RecipeShow = (props: ShowProps): React.ReactElement => {
  return (
    <Show {...props}>
      <SimpleShowLayout>
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
      </SimpleShowLayout>
    </Show>
  );
};
