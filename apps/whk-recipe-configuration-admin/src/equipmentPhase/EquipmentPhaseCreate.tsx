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
  BooleanInput,
  NumberInput,
} from "react-admin";

import { InstructionTitle } from "../instruction/InstructionTitle";
import { OperationTitle } from "../operation/OperationTitle";
import { PhaseParameterTitle } from "../phaseParameter/PhaseParameterTitle";
import { TestParameterTitle } from "../testParameter/TestParameterTitle";

export const EquipmentPhaseCreate = (
  props: CreateProps
): React.ReactElement => {
  return (
    <Create {...props}>
      <SimpleForm>
        <TextInput label="Bom ID" source="bomId" />
        <TextInput label="Class Name" source="className" />
        <TextInput label="Created By" source="createdBy" />
        <TextInput label="Description" source="description" />
        <TextInput label="Edited By" source="editedBy" />
        <ReferenceArrayInput
          source="instructions"
          reference="Instruction"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={InstructionTitle} />
        </ReferenceArrayInput>
        <TextInput label="Name" source="name" />
        <ReferenceInput
          source="operations.id"
          reference="Operation"
          label="Operation"
        >
          <SelectInput optionText={OperationTitle} />
        </ReferenceInput>
        <BooleanInput
          label="Operation Sequence Index"
          source="operationSequenceIndex"
        />
        <NumberInput
          step={1}
          label="Operation Step Sequence"
          source="operationStepSequence"
        />
        <ReferenceArrayInput
          source="phaseParameters"
          reference="PhaseParameter"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={PhaseParameterTitle} />
        </ReferenceArrayInput>
        <NumberInput step={1} label="Revision" source="revision" />
        <TextInput label="Schema Version" source="schemaVersion" />
        <ReferenceInput
          source="testParameters.id"
          reference="TestParameter"
          label="Test Parameters"
        >
          <SelectInput optionText={TestParameterTitle} />
        </ReferenceInput>
      </SimpleForm>
    </Create>
  );
};
