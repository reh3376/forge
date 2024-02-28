import * as React from "react";

import {
  Create,
  SimpleForm,
  CreateProps,
  ReferenceInput,
  SelectInput,
  TextInput,
  ReferenceArrayInput,
  SelectArrayInput,
  BooleanInput,
  NumberInput,
} from "react-admin";

import { BomTitle } from "../bom/BomTitle";
import { EquipmentPhaseTitle } from "./EquipmentPhaseTitle";
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
        <ReferenceInput source="bom.id" reference="Bom" label="Bom">
          <SelectInput optionText={BomTitle} />
        </ReferenceInput>
        <ReferenceInput
          source="classId.id"
          reference="EquipmentPhase"
          label="Class"
        >
          <SelectInput optionText={EquipmentPhaseTitle} />
        </ReferenceInput>
        <TextInput label="Class Name" source="className" />
        <TextInput label="Created By" source="createdBy" />
        <TextInput label="Description" source="description" />
        <TextInput label="Edited By" source="editedBy" />
        <ReferenceArrayInput
          source="instances"
          reference="EquipmentPhase"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={EquipmentPhaseTitle} />
        </ReferenceArrayInput>
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
        <ReferenceArrayInput
          source="testParameters"
          reference="TestParameter"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={TestParameterTitle} />
        </ReferenceArrayInput>
      </SimpleForm>
    </Create>
  );
};
