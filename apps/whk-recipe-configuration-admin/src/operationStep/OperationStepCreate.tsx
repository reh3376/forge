import * as React from "react";

import {
  Create,
  SimpleForm,
  CreateProps,
  TextInput,
  ReferenceArrayInput,
  SelectArrayInput,
  ReferenceInput,
  SelectInput,
  NumberInput,
  BooleanInput,
} from "react-admin";

import { InstructionTitle } from "../instruction/InstructionTitle";
import { OperationTitle } from "../operation/OperationTitle";

export const OperationStepCreate = (props: CreateProps): React.ReactElement => {
  return (
    <Create {...props}>
      <SimpleForm>
        <TextInput label="Bom ID" source="bomId" />
        <TextInput label="Class Name" source="className" />
        <TextInput label="Created By" source="createdBy" />
        <TextInput label="Edited By" source="editedBy" />
        <ReferenceArrayInput
          source="instructions"
          reference="Instruction"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={InstructionTitle} />
        </ReferenceArrayInput>
        <ReferenceInput
          source="operations.id"
          reference="Operation"
          label="Operation"
        >
          <SelectInput optionText={OperationTitle} />
        </ReferenceInput>
        <TextInput
          label="Operation Step Description"
          source="operationStepDescription"
        />
        <TextInput label="Operation Step Name" source="operationStepName" />
        <NumberInput
          step={1}
          label="Operation Step Revision"
          source="operationStepRevision"
        />
        <NumberInput
          step={1}
          label="Operation Step Sequence"
          source="operationStepSequence"
        />
        <TextInput label="Recipe ID" source="recipeId" />
        <TextInput label="Schema Version" source="schemaVersion" />
        <BooleanInput label="Sequence Operation" source="sequenceOperation" />
        <div />
      </SimpleForm>
    </Create>
  );
};
