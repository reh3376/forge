import * as React from "react";

import {
  Edit,
  SimpleForm,
  EditProps,
  BooleanInput,
  TextInput,
  NumberInput,
  ReferenceArrayInput,
  SelectArrayInput,
} from "react-admin";

import { OperationStepTitle } from "../operationStep/OperationStepTitle";

export const OperationEdit = (props: EditProps): React.ReactElement => {
  return (
    <Edit {...props}>
      <SimpleForm>
        <BooleanInput label="Active" source="active" />
        <TextInput label="Created By" source="createdBy" />
        <TextInput label="Edited By" source="editedBy" />
        <TextInput label="globalUuid" source="globalUuid" />
        <TextInput
          label="Operation Description"
          source="operationDescription"
        />
        <TextInput label="Operation Name" source="operationName" />
        <NumberInput
          step={1}
          label="Operation Revision"
          source="operationRevision"
        />
        <NumberInput
          step={1}
          label="Operation Sequence Number"
          source="operationSequenceNumber"
        />
        <ReferenceArrayInput
          source="operationSteps"
          reference="OperationStep"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={OperationStepTitle} />
        </ReferenceArrayInput>
        <div />
        <TextInput label="Schema Version" source="schemaVersion" />
      </SimpleForm>
    </Edit>
  );
};
