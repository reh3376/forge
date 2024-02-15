import * as React from "react";

import {
  List,
  Datagrid,
  ListProps,
  TextField,
  DateField,
  BooleanField,
  ReferenceField,
} from "react-admin";

import Pagination from "../Components/Pagination";
import { OPERATION_TITLE_FIELD } from "../operation/OperationTitle";
import { TESTPARAMETER_TITLE_FIELD } from "../testParameter/TestParameterTitle";

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
        <TextField label="Bom ID" source="bomId" />
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
        <BooleanField
          label="Operation Sequence Index"
          source="operationSequenceIndex"
        />
        <TextField
          label="Operation Step Sequence"
          source="operationStepSequence"
        />
        <TextField label="Revision" source="revision" />
        <TextField label="Schema Version" source="schemaVersion" />
        <ReferenceField
          label="Test Parameters"
          source="testparameter.id"
          reference="TestParameter"
        >
          <TextField source={TESTPARAMETER_TITLE_FIELD} />
        </ReferenceField>
      </Datagrid>
    </List>
  );
};
