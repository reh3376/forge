import * as React from "react";

import {
  List,
  Datagrid,
  ListProps,
  ReferenceField,
  TextField,
  DateField,
  BooleanField,
} from "react-admin";

import Pagination from "../Components/Pagination";
import { BOM_TITLE_FIELD } from "../bom/BomTitle";
import { EQUIPMENTPHASE_TITLE_FIELD } from "./EquipmentPhaseTitle";
import { OPERATION_TITLE_FIELD } from "../operation/OperationTitle";

export const EquipmentPhaseList = (props: ListProps): React.ReactElement => {
  return (
    <List
      {...props}
      bulkActionButtons={false}
      title={"EquipmentPhases"}
      perPage={50}
      pagination={<Pagination />}
    >
      <Datagrid rowClick="show">
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
        <BooleanField label="Is Class Definition" source="isClassDefinition" />
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
        <TextField
          label="Operation Step Sequence"
          source="operationStepSequence"
        />
        <TextField label="Revision" source="revision" />
        <TextField label="Schema Version" source="schemaVersion" />
      </Datagrid>
    </List>
  );
};
