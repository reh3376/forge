import * as React from "react";

import {
  Create,
  SimpleForm,
  CreateProps,
  TextInput,
  NumberInput,
  ReferenceArrayInput,
  SelectArrayInput,
} from "react-admin";

import { EquipmentPhaseTitle } from "../equipmentPhase/EquipmentPhaseTitle";

export const BomCreate = (props: CreateProps): React.ReactElement => {
  return (
    <Create {...props}>
      <SimpleForm>
        <TextInput label="Bom Name" source="bomName" />
        <NumberInput step={1} label="Bom Revision" source="bomRevision" />
        <TextInput label="Class Name" source="className" />
        <TextInput label="Created By" source="createdBy" />
        <TextInput label="Edited By" source="editedBy" />
        <ReferenceArrayInput
          source="equipmentPhases"
          reference="EquipmentPhase"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={EquipmentPhaseTitle} />
        </ReferenceArrayInput>
        <TextInput label="Schema Version" source="schemaVersion" />
        <TextInput label="Wip Item ID" source="wipItemId" />
      </SimpleForm>
    </Create>
  );
};
