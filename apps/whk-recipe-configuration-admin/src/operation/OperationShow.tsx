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

import { BOM_TITLE_FIELD } from "../bom/BomTitle";
import { OPERATION_TITLE_FIELD } from "./OperationTitle";
import { TESTPARAMETER_TITLE_FIELD } from "../testParameter/TestParameterTitle";
import { PROCEDURE_TITLE_FIELD } from "../procedure/ProcedureTitle";

export const OperationShow = (props: ShowProps): React.ReactElement => {
  return (
    <Show {...props}>
      <SimpleShowLayout>
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
        <ReferenceField
          label="Procedure"
          source="procedure.id"
          reference="Procedure"
        >
          <TextField source={PROCEDURE_TITLE_FIELD} />
        </ReferenceField>
        <TextField
          label="Procedure Sequence Index"
          source="procedureSequenceIndex"
        />
        <TextField label="Revision" source="revision" />
        <TextField label="Schema Version" source="schemaVersion" />
        <DateField source="updatedAt" label="Updated At" />
        <ReferenceManyField
          reference="EquipmentPhase"
          target="operationId"
          label="EquipmentPhases"
        >
          <Datagrid rowClick="show">
            <ReferenceField label="Bom" source="bom.id" reference="Bom">
              <TextField source={BOM_TITLE_FIELD} />
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
        </ReferenceManyField>
        <ReferenceManyField
          reference="Operation"
          target="classIdId"
          label="Operations"
        >
          <Datagrid rowClick="show">
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
            <ReferenceField
              label="Procedure"
              source="procedure.id"
              reference="Procedure"
            >
              <TextField source={PROCEDURE_TITLE_FIELD} />
            </ReferenceField>
            <TextField
              label="Procedure Sequence Index"
              source="procedureSequenceIndex"
            />
            <TextField label="Revision" source="revision" />
            <TextField label="Schema Version" source="schemaVersion" />
            <DateField source="updatedAt" label="Updated At" />
          </Datagrid>
        </ReferenceManyField>
        <ReferenceManyField
          reference="Recipe"
          target="operationId"
          label="Recipes"
        >
          <Datagrid rowClick="show">
            <BooleanField label="Active" source="active" />
            <DateField source="createdAt" label="Created At" />
            <TextField label="Created By" source="createdBy" />
            <TextField label="Customer ID" source="customerId" />
            <TextField label="ID" source="id" />
            <TextField label="Item Description" source="itemDescription" />
            <TextField label="Item ID" source="itemId" />
            <TextField label="Mash Bill" source="mashBill" />
            <ReferenceField
              label="Operation"
              source="operation.id"
              reference="Operation"
            >
              <TextField source={OPERATION_TITLE_FIELD} />
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
