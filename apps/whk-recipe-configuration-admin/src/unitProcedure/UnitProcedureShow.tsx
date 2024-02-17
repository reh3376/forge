import * as React from "react";

import {
  Show,
  SimpleShowLayout,
  ShowProps,
  BooleanField,
  ReferenceField,
  TextField,
  DateField,
  ReferenceManyField,
  Datagrid,
} from "react-admin";

import { UNITPROCEDURE_TITLE_FIELD } from "./UnitProcedureTitle";
import { PROCEDURE_TITLE_FIELD } from "../procedure/ProcedureTitle";
import { OPERATION_TITLE_FIELD } from "../operation/OperationTitle";

export const UnitProcedureShow = (props: ShowProps): React.ReactElement => {
  return (
    <Show {...props}>
      <SimpleShowLayout>
        <BooleanField label="Active" source="active" />
        <ReferenceField
          label="Class"
          source="unitprocedure.id"
          reference="UnitProcedure"
        >
          <TextField source={UNITPROCEDURE_TITLE_FIELD} />
        </ReferenceField>
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <TextField label="Description" source="description" />
        <TextField label="ID" source="id" />
        <BooleanField label="Is Class Def" source="isClassDef" />
        <TextField label="Name" source="name" />
        <ReferenceField
          label="Procedure"
          source="procedure.id"
          reference="Procedure"
        >
          <TextField source={PROCEDURE_TITLE_FIELD} />
        </ReferenceField>
        <TextField label="Revision" source="revision" />
        <TextField label="Schema Version" source="schemaVersion" />
        <DateField source="updatedAt" label="Updated At" />
        <TextField label="Updated By" source="updatedBy" />
        <ReferenceManyField
          reference="UnitProcedure"
          target="classIdId"
          label="Unit Procedures"
        >
          <Datagrid rowClick="show">
            <BooleanField label="Active" source="active" />
            <ReferenceField
              label="Class"
              source="unitprocedure.id"
              reference="UnitProcedure"
            >
              <TextField source={UNITPROCEDURE_TITLE_FIELD} />
            </ReferenceField>
            <DateField source="createdAt" label="Created At" />
            <TextField label="Created By" source="createdBy" />
            <TextField label="Description" source="description" />
            <TextField label="ID" source="id" />
            <BooleanField label="Is Class Def" source="isClassDef" />
            <TextField label="Name" source="name" />
            <ReferenceField
              label="Procedure"
              source="procedure.id"
              reference="Procedure"
            >
              <TextField source={PROCEDURE_TITLE_FIELD} />
            </ReferenceField>
            <TextField label="Revision" source="revision" />
            <TextField label="Schema Version" source="schemaVersion" />
            <DateField source="updatedAt" label="Updated At" />
            <TextField label="Updated By" source="updatedBy" />
          </Datagrid>
        </ReferenceManyField>
        <ReferenceManyField
          reference="Operation"
          target="unitProcedureId"
          label="Operations"
        >
          <Datagrid rowClick="show">
            <TextField label="Abbreviation" source="abbreviation" />
            <BooleanField label="Active" source="active" />
            <ReferenceField
              label="Class"
              source="operation.id"
              reference="Operation"
            >
              <TextField source={OPERATION_TITLE_FIELD} />
            </ReferenceField>
            <DateField source="createdAt" label="Created At" />
            <TextField label="Created By" source="createdBy" />
            <TextField label="Description" source="description" />
            <TextField label="Edited By" source="editedBy" />
            <TextField label="ID" source="id" />
            <BooleanField
              label="Is Class Definition"
              source="isClassDefinition"
            />
            <TextField label="Name" source="name" />
            <TextField label="Path" source="path" />
            <TextField
              label="Procedure Sequence Index"
              source="procedureSequenceIndex"
            />
            <TextField label="Revision" source="revision" />
            <TextField label="Schema Version" source="schemaVersion" />
            <ReferenceField
              label="Unit Procedure"
              source="unitprocedure.id"
              reference="UnitProcedure"
            >
              <TextField source={UNITPROCEDURE_TITLE_FIELD} />
            </ReferenceField>
            <DateField source="updatedAt" label="Updated At" />
          </Datagrid>
        </ReferenceManyField>
      </SimpleShowLayout>
    </Show>
  );
};
