import * as React from "react";

import {
  Edit,
  SimpleForm,
  EditProps,
  ReferenceInput,
  SelectInput,
  TextInput,
  ReferenceArrayInput,
  SelectArrayInput,
  BooleanInput,
  NumberInput,
} from "react-admin";

import { BomTitle } from "../bom/BomTitle";
import { InstructionTitle } from "../instruction/InstructionTitle";
import { OperationTitle } from "../operation/OperationTitle";
import { PhaseParameterTitle } from "../phaseParameter/PhaseParameterTitle";
import { TestParameterTitle } from "../testParameter/TestParameterTitle";

export const EquipmentPhaseEdit = (props: EditProps): React.ReactElement => {
  return (
    <Edit {...props}>
      <SimpleForm>
        <ReferenceInput source="bom.id" reference="Bom" label="Bom">
          <SelectInput optionText={BomTitle} />
        </ReferenceInput>
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
        <BooleanInput label="Is Class Definition" source="isClassDefinition" />
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
    </Edit>
  );
};
