import * as React from "react";

import {
  Edit,
  SimpleForm,
  EditProps,
  TextInput,
  BooleanInput,
  NumberInput,
  ReferenceInput,
  SelectInput,
} from "react-admin";

import { RecipeTitle } from "../recipe/RecipeTitle";

export const ProductionOrderQueueEdit = (
  props: EditProps
): React.ReactElement => {
  return (
    <Edit {...props}>
      <SimpleForm>
        <TextInput label="Account ID" source="accountId" />
        <BooleanInput label="Active" source="active" />
        <TextInput label="Created By" source="createdBy" />
        <NumberInput step={1} label="Queue Index" source="queueIndex" />
        <ReferenceInput source="recipe.id" reference="Recipe" label="Recipe">
          <SelectInput optionText={RecipeTitle} />
        </ReferenceInput>
        <TextInput label="Revision" source="revision" />
        <TextInput label="Sales Order ID" source="salesOrderId" />
        <TextInput label="Schema Version" source="schemaVersion" />
        <TextInput label="Updated By" source="updatedBy" />
      </SimpleForm>
    </Edit>
  );
};
