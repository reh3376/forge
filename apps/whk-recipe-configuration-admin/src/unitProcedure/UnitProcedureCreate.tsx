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
        <ReferenceArrayInput
          source="instances"
          reference="UnitProcedure"
          parse={(value: any) => value && value.map((v: any) => ({ id: v }))}
          format={(value: any) => value && value.map((v: any) => v.id)}
        >
          <SelectArrayInput optionText={UnitProcedureTitle} />
        </ReferenceArrayInput>
        <BooleanInput label="Is Class Def" source="isClassDef" />
        <SelectInput
          source="name"
          label="Name"
          choices={[
            { label: "Mashing01", value: "Mashing01" },
            { label: "Fermentation01", value: "Fermentation01" },
            { label: "Distillation01", value: "Distillation01" },
            { label: "Processing01", value: "Processing01" },
            { label: "Granary01", value: "Granary01" },
          ]}
          optionText="label"
          optionValue="value"
        />
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
        <TextInput label="Updated By" source="updatedBy" />
      </SimpleForm>
    </Create>
  );
};
