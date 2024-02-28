import * as React from "react";

import {
  Edit,
  SimpleForm,
  EditProps,
  TextInput,
  NumberInput,
  ReferenceArrayInput,
  SelectArrayInput,
} from "react-admin";

import { EquipmentPhaseTitle } from "../equipmentPhase/EquipmentPhaseTitle";

export const BomEdit = (props: EditProps): React.ReactElement => {
  return (
    <Edit {...props}>
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
    </Edit>
  );
};
