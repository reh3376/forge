import * as React from "react";

import {
  Show,
  SimpleShowLayout,
  ShowProps,
  BooleanField,
  DateField,
  TextField,
  ReferenceField,
  ReferenceManyField,
  Datagrid,
} from "react-admin";

import { RECIPE_TITLE_FIELD } from "./RecipeTitle";
import { OPERATION_TITLE_FIELD } from "../operation/OperationTitle";

export const RecipeShow = (props: ShowProps): React.ReactElement => {
  return (
    <Show {...props}>
      <SimpleShowLayout>
        <BooleanField label="Active" source="active" />
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <TextField label="Customer ID" source="customer" />
        <TextField label="ID" source="id" />
        <TextField label="Item" source="item" />
        <TextField label="Item Description" source="itemDescription" />
        <TextField label="Mash Bill" source="mashBill" />
        <ReferenceField
          label="Operation"
          source="operation.id"
          reference="Operation"
        >
          <TextField source={OPERATION_TITLE_FIELD} />
        </ReferenceField>
        <TextField label="Revision" source="revision" />
        <TextField label="Schema Version" source="schemaVersion" />
        <DateField source="updatedAt" label="Updated At" />
        <TextField label="Updated By" source="updatedBy" />
        <ReferenceManyField
          reference="ProductionOrderQueue"
          target="recipeId"
          label="Production Order Queues"
        >
          <Datagrid rowClick="show">
            <TextField label="Account ID" source="accountId" />
            <BooleanField label="Active" source="active" />
            <DateField source="createdAt" label="Created At" />
            <TextField label="Created By" source="createdBy" />
            <TextField label="ID" source="id" />
            <TextField label="Queue Index" source="queueIndex" />
            <ReferenceField
              label="Recipe"
              source="recipe.id"
              reference="Recipe"
            >
              <TextField source={RECIPE_TITLE_FIELD} />
            </ReferenceField>
            <TextField label="Revision" source="revision" />
            <TextField label="Sales Order ID" source="salesOrderId" />
            <TextField label="Schema Version" source="schemaVersion" />
            <DateField source="updatedAt" label="Updated At" />
            <TextField label="Updated By" source="updatedBy" />
          </Datagrid>
        </ReferenceManyField>
      </SimpleShowLayout>
    </Show>
  );
};
