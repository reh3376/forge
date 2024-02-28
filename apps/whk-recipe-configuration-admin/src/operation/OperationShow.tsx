import * as React from "react";

import {
  Show,
  SimpleShowLayout,
  ShowProps,
  TextField,
  BooleanField,
  ReferenceField,
  DateField,
  ReferenceManyField,
  Datagrid,
} from "react-admin";

import { BOM_TITLE_FIELD } from "../bom/BomTitle";
import { EQUIPMENTPHASE_TITLE_FIELD } from "../equipmentPhase/EquipmentPhaseTitle";
import { OPERATION_TITLE_FIELD } from "./OperationTitle";
import { UNITPROCEDURE_TITLE_FIELD } from "../unitProcedure/UnitProcedureTitle";

export const OperationShow = (props: ShowProps): React.ReactElement => {
  return (
    <Show {...props}>
      <SimpleShowLayout>
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
        <BooleanField label="Is Class Definition" source="isClassDefinition" />
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
        <ReferenceManyField
          reference="EquipmentPhase"
          target="operationId"
          label="EquipmentPhases"
        >
          <Datagrid rowClick="show">
            <BooleanField label="Active" source="active" />
            <ReferenceField label="Bom" source="bom.id" reference="Bom">
              <TextField source={BOM_TITLE_FIELD} />
            </ReferenceField>
            <ReferenceField
              label="Class"
              source="equipmentphase.id"
              reference="EquipmentPhase"
            >
              <TextField source={EQUIPMENTPHASE_TITLE_FIELD} />
            </ReferenceField>
            <TextField label="Class Name" source="className" />
            <DateField source="createdAt" label="Created At" />
            <TextField label="Created By" source="createdBy" />
            <TextField label="Description" source="description" />
            <DateField source="editedAt" label="Edited At" />
            <TextField label="Edited By" source="editedBy" />
            <TextField label="ID" source="id" />
            <BooleanField
              label="Is Class Definition"
              source="isClassDefinition"
            />
            <TextField label="Name" source="name" />
            <ReferenceField
              label="Operation"
              source="operation.id"
              reference="Operation"
            >
              <TextField source={OPERATION_TITLE_FIELD} />
            </ReferenceField>
            <TextField
              label="Operation Sequence Index"
              source="operationSequenceIndex"
            />
            <TextField label="Revision" source="revision" />
            <TextField label="Schema Version" source="schemaVersion" />
          </Datagrid>
        </ReferenceManyField>
        <ReferenceManyField
          reference="Operation"
          target="classIdId"
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
