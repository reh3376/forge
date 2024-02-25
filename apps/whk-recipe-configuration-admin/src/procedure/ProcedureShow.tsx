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

import { PROCEDURE_TITLE_FIELD } from "./ProcedureTitle";
import { UNITPROCEDURE_TITLE_FIELD } from "../unitProcedure/UnitProcedureTitle";

export const ProcedureShow = (props: ShowProps): React.ReactElement => {
  return (
    <Show {...props}>
      <SimpleShowLayout>
        <BooleanField label="Active" source="active" />
        <ReferenceField
          label="Class"
          source="procedure.id"
          reference="Procedure"
        >
          <TextField source={PROCEDURE_TITLE_FIELD} />
        </ReferenceField>
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <TextField label="Description" source="description" />
        <TextField label="ID" source="id" />
        <BooleanField label="Is Class Definition" source="isClassDefinition" />
        <TextField label="Name" source="name" />
        <TextField label="Revision" source="revision" />
        <TextField label="Schema Version" source="schemaVersion" />
        <DateField source="updatedAt" label="Updated At" />
        <TextField label="Updated By" source="updatedBy" />
        <ReferenceManyField
          reference="Procedure"
          target="classIdId"
          label="Procedures"
        >
          <Datagrid rowClick="show">
            <BooleanField label="Active" source="active" />
            <ReferenceField
              label="Class"
              source="procedure.id"
              reference="Procedure"
            >
              <TextField source={PROCEDURE_TITLE_FIELD} />
            </ReferenceField>
            <DateField source="createdAt" label="Created At" />
            <TextField label="Created By" source="createdBy" />
            <TextField label="Description" source="description" />
            <TextField label="ID" source="id" />
            <BooleanField
              label="Is Class Definition"
              source="isClassDefinition"
            />
            <TextField label="Name" source="name" />
            <TextField label="Revision" source="revision" />
            <TextField label="Schema Version" source="schemaVersion" />
            <DateField source="updatedAt" label="Updated At" />
            <TextField label="Updated By" source="updatedBy" />
          </Datagrid>
        </ReferenceManyField>
        <ReferenceManyField
          reference="ProductionOrderQueue"
          target="procedureId"
          label="Production Order Queues"
        >
          <Datagrid rowClick="show">
            <TextField label="Account ID" source="accountId" />
            <BooleanField label="Active" source="active" />
            <DateField source="createdAt" label="Created At" />
            <TextField label="Created By" source="createdBy" />
            <TextField label="ID" source="id" />
            <ReferenceField
              label="Procedure"
              source="procedure.id"
              reference="Procedure"
            >
              <TextField source={PROCEDURE_TITLE_FIELD} />
            </ReferenceField>
            <TextField label="Queue Index" source="queueIndex" />
            <TextField label="Revision" source="revision" />
            <TextField label="Sales Order ID" source="salesOrderId" />
            <TextField label="Schema Version" source="schemaVersion" />
            <DateField source="updatedAt" label="Updated At" />
            <TextField label="Updated By" source="updatedBy" />
          </Datagrid>
        </ReferenceManyField>
        <ReferenceManyField
          reference="UnitProcedure"
          target="procedureId"
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
      </SimpleShowLayout>
    </Show>
  );
};
