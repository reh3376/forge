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
import { EQUIPMENTPHASE_TITLE_FIELD } from "../equipmentPhase/EquipmentPhaseTitle";
import { OPERATION_TITLE_FIELD } from "../operation/OperationTitle";

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
        <TextField label="Wip Item ID" source="wipItemId" />
        <ReferenceManyField
          reference="EquipmentPhase"
          target="bomId"
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
      </SimpleShowLayout>
    </Show>
  );
};
