import * as React from "react";

import {
  Edit,
  SimpleForm,
  EditProps,
  BooleanInput,
  TextInput,
  ReferenceInput,
  SelectInput,
  ReferenceArrayInput,
  SelectArrayInput,
  NumberInput,
} from "react-admin";

import { OperationTitle } from "../operation/OperationTitle";
import { ProductionOrderQueueTitle } from "../productionOrderQueue/ProductionOrderQueueTitle";

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
        <ReferenceInput
          source="operation.id"
          reference="Operation"
          label="Operation"
        >
          <SelectInput optionText={OperationTitle} />
        </ReferenceInput>
        <ReferenceArrayInput
          source="productionOrderQueues"
          reference="ProductionOrderQueue"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={ProductionOrderQueueTitle} />
        </ReferenceArrayInput>
        <NumberInput step={1} label="Revision" source="revision" />
        <TextInput label="Schema Version" source="schemaVersion" />
        <TextInput label="Updated By" source="updatedBy" />
      </SimpleForm>
    </Edit>
  );
};
