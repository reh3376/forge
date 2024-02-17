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

import { UnitProcedureTitle } from "./UnitProcedureTitle";
import { OperationTitle } from "../operation/OperationTitle";
import { ProcedureTitle } from "../procedure/ProcedureTitle";

export const UnitProcedureCreate = (props: CreateProps): React.ReactElement => {
  return (
    <Create {...props}>
      <SimpleForm>
        <BooleanInput label="Active" source="active" />
        <ReferenceInput
          source="classId.id"
          reference="UnitProcedure"
          label="Class"
        >
          <SelectInput optionText={UnitProcedureTitle} />
        </ReferenceInput>
        <TextInput label="Created By" source="createdBy" />
        <TextInput label="Description" multiline source="description" />
        <BooleanInput label="Is Class Def" source="isClassDef" />
        <TextInput label="Name" source="name" />
        <ReferenceArrayInput
          source="operations"
          reference="Operation"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={OperationTitle} />
        </ReferenceArrayInput>
        <ReferenceInput
          source="procedure.id"
          reference="Procedure"
          label="Procedure"
        >
          <SelectInput optionText={ProcedureTitle} />
        </ReferenceInput>
        <NumberInput step={1} label="Revision" source="revision" />
        <TextInput label="Schema Version" source="schemaVersion" />
        <ReferenceArrayInput
          source="unitProcedure"
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
