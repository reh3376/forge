import * as React from "react";

import {
  Create,
  SimpleForm,
  CreateProps,
  BooleanInput,
  ReferenceInput,
  SelectInput,
  TextInput,
  ReferenceArrayInput,
  SelectArrayInput,
  NumberInput,
} from "react-admin";

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
        <BooleanInput label="Active" source="active" />
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
        <SelectInput
          source="name"
          label="Name"
          choices={[
            { label: "Ingredient Add", value: "IngredientAdd" },
            { label: "Pre-Steam", value: "PreSteam" },
            { label: "Steam", value: "Steam" },
            { label: "Hold", value: "Hold" },
          ]}
          optionText="label"
          optionValue="value"
        />
        <ReferenceInput
          source="operation.id"
          reference="Operation"
          label="Operation"
        >
          <SelectInput optionText={OperationTitle} />
        </ReferenceInput>
        <NumberInput
          step={1}
          label="Operation Sequence Index"
          source="operationSequenceIndex"
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
