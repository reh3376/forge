import * as React from "react";

import {
  Show,
  SimpleShowLayout,
  ShowProps,
  TextField,
  DateField,
  ReferenceManyField,
  Datagrid,
  BooleanField,
  ReferenceField,
} from "react-admin";

import { BOM_TITLE_FIELD } from "./BomTitle";
import { UNITPROCEDURE_TITLE_FIELD } from "../unitProcedure/UnitProcedureTitle";
import { PROCEDURE_TITLE_FIELD } from "../procedure/ProcedureTitle";

export const BomShow = (props: ShowProps): React.ReactElement => {
  return (
    <Show {...props}>
      <SimpleShowLayout>
        <TextField label="Bom Name" source="bomName" />
        <TextField label="Bom Revision" source="bomRevision" />
        <TextField label="Class Name" source="className" />
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <DateField source="editedAt" label="Edited At" />
        <TextField label="Edited By" source="editedBy" />
        <TextField label="ID" source="id" />
        <TextField label="Schema Version" source="schemaVersion" />
        <TextField label="Wip Item" source="wipItem" />
        <ReferenceManyField
          reference="UnitProcedure"
          target="bomsId"
          label="Unit Procedures"
        >
          <Datagrid rowClick="show">
            <BooleanField label="Active" source="active" />
            <ReferenceField label="Boms" source="bom.id" reference="Bom">
              <TextField source={BOM_TITLE_FIELD} />
            </ReferenceField>
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
            <ReferenceField label="Primary Bom" source="bom.id" reference="Bom">
              <TextField source={BOM_TITLE_FIELD} />
            </ReferenceField>
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
          reference="UnitProcedure"
          target="primaryBomId"
          label="Unit Procedures"
        >
          <Datagrid rowClick="show">
            <BooleanField label="Active" source="active" />
            <ReferenceField label="Boms" source="bom.id" reference="Bom">
              <TextField source={BOM_TITLE_FIELD} />
            </ReferenceField>
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
            <ReferenceField label="Primary Bom" source="bom.id" reference="Bom">
              <TextField source={BOM_TITLE_FIELD} />
            </ReferenceField>
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
      </SimpleShowLayout>
    </Show>
  );
};
