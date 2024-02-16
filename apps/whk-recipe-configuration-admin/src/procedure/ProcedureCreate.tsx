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

import { ProcedureTitle } from "./ProcedureTitle";
import { UnitProcedureTitle } from "../unitProcedure/UnitProcedureTitle";

export const ProcedureCreate = (props: CreateProps): React.ReactElement => {
  return (
    <Create {...props}>
      <SimpleForm>
        <BooleanInput label="Active" source="active" />
        <ReferenceInput source="classId.id" reference="Procedure" label="Class">
          <SelectInput optionText={ProcedureTitle} />
        </ReferenceInput>
        <TextInput label="Created By" source="createdBy" />
        <TextInput label="Description" multiline source="description" />
        <BooleanInput label="Is Class Definition" source="isClassDefinition" />
        <TextInput label="Name" source="name" />
        <ReferenceArrayInput
          source="procedures"
          reference="Procedure"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={ProcedureTitle} />
        </ReferenceArrayInput>
        <NumberInput step={1} label="Revision" source="revision" />
        <TextInput label="Schema Version" source="schemaVersion" />
        <ReferenceArrayInput
          source="unitProcedures"
          reference="UnitProcedure"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={UnitProcedureTitle} />
        </ReferenceArrayInput>
        <TextInput label="Updated By" source="updatedBy" />
      </SimpleForm>
    </Create>
  );
};
