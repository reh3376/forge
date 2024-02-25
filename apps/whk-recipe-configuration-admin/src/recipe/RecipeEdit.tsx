import * as React from "react";
import {
  Edit,
  SimpleForm,
  EditProps,
  BooleanInput,
  TextInput,
  NumberInput,
} from "react-admin";

export const RecipeEdit = (props: EditProps): React.ReactElement => {
  return (
    <Edit {...props}>
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
        <TextInput label="Mash Bill" source="mashBill" />
        <NumberInput step={1} label="Revision" source="revision" />
        <TextInput label="Schema Version" source="schemaVersion" />
        <TextInput label="Updated By" source="updatedBy" />
      </SimpleForm>
    </Edit>
  );
};
