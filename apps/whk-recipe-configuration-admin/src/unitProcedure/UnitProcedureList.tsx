import * as React from "react";

import {
  List,
  Datagrid,
  ListProps,
  BooleanField,
  ReferenceField,
  TextField,
  DateField,
} from "react-admin";

import Pagination from "../Components/Pagination";
import { BOM_TITLE_FIELD } from "../bom/BomTitle";
import { UNITPROCEDURE_TITLE_FIELD } from "./UnitProcedureTitle";
import { PROCEDURE_TITLE_FIELD } from "../procedure/ProcedureTitle";

export const UnitProcedureList = (props: ListProps): React.ReactElement => {
  return (
    <List
      {...props}
      bulkActionButtons={false}
      title={"Unit Procedures"}
      perPage={50}
      pagination={<Pagination />}
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
    </List>
  );
};
