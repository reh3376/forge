import * as React from "react";

import {
  Create,
  SimpleForm,
  CreateProps,
  BooleanInput,
  TextInput,
  ReferenceArrayInput,
  SelectArrayInput,
  ReferenceInput,
  SelectInput,
  NumberInput,
} from "react-admin";

import { EquipmentPhaseTitle } from "../equipmentPhase/EquipmentPhaseTitle";
import { ProcedureTitle } from "../procedure/ProcedureTitle";

export const OperationCreate = (props: CreateProps): React.ReactElement => {
  return (
    <Create {...props}>
      <SimpleForm>
        <BooleanInput label="Active" source="active" />
        <TextInput label="Created By" source="createdBy" />
        <TextInput label="Description" source="description" />
        <TextInput label="Edited By" source="editedBy" />
        <TextInput label="globalUuid" source="globalUuid" />
        <TextInput label="Name" source="name" />
        <ReferenceArrayInput
          source="operationSteps"
          reference="EquipmentPhase"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={EquipmentPhaseTitle} />
        </ReferenceArrayInput>
        <ReferenceInput
          source="procedure.id"
          reference="Procedure"
          label="Procedure"
        >
          <SelectInput optionText={ProcedureTitle} />
        </ReferenceInput>
        <NumberInput
          step={1}
          label="Procedure Sequence Index"
          source="procedureSequenceIndex"
        />
        <NumberInput step={1} label="Revision" source="revision" />
        <TextInput label="Schema Version" source="schemaVersion" />
      </SimpleForm>
    </Create>
  );
};
