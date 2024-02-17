import * as React from "react";

import {
  Create,
  SimpleForm,
  CreateProps,
  TextInput,
  BooleanInput,
  ReferenceInput,
  SelectInput,
  ReferenceArrayInput,
  SelectArrayInput,
  NumberInput,
} from "react-admin";

import { OperationTitle } from "./OperationTitle";
import { EquipmentPhaseTitle } from "../equipmentPhase/EquipmentPhaseTitle";
import { RecipeTitle } from "../recipe/RecipeTitle";
import { UnitProcedureTitle } from "../unitProcedure/UnitProcedureTitle";

export const OperationCreate = (props: CreateProps): React.ReactElement => {
  return (
    <Create {...props}>
      <SimpleForm>
        <TextInput label="Abbreviation" source="abbreviation" />
        <BooleanInput label="Active" source="active" />
        <ReferenceInput source="classId.id" reference="Operation" label="Class">
          <SelectInput optionText={OperationTitle} />
        </ReferenceInput>
        <TextInput label="Created By" source="createdBy" />
        <TextInput label="Description" source="description" />
        <TextInput label="Edited By" source="editedBy" />
        <ReferenceArrayInput
          source="equipmentPhases"
          reference="EquipmentPhase"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={EquipmentPhaseTitle} />
        </ReferenceArrayInput>
        <ReferenceArrayInput
          source="instances"
          reference="Operation"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={OperationTitle} />
        </ReferenceArrayInput>
        <BooleanInput label="Is Class Definition" source="isClassDefinition" />
        <TextInput label="Name" source="name" />
        <TextInput label="Path" source="path" />
        <NumberInput
          step={1}
          label="Procedure Sequence Index"
          source="procedureSequenceIndex"
        />
        <ReferenceArrayInput
          source="recipes"
          reference="Recipe"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={RecipeTitle} />
        </ReferenceArrayInput>
        <NumberInput step={1} label="Revision" source="revision" />
        <TextInput label="Schema Version" source="schemaVersion" />
        <ReferenceInput
          source="unitProcedure.id"
          reference="UnitProcedure"
          label="Unit Procedure"
        >
          <SelectInput optionText={UnitProcedureTitle} />
        </ReferenceInput>
      </SimpleForm>
    </Create>
  );
};
