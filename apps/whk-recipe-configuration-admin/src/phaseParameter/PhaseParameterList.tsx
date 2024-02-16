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
import { PHASEPARAMETER_TITLE_FIELD } from "./PhaseParameterTitle";
import { EQUIPMENTPHASE_TITLE_FIELD } from "../equipmentPhase/EquipmentPhaseTitle";

export const PhaseParameterList = (props: ListProps): React.ReactElement => {
  return (
    <List
      {...props}
      bulkActionButtons={false}
      title={"Phase Parameter"}
      perPage={50}
      pagination={<Pagination />}
    >
      <Datagrid rowClick="show">
        <BooleanField label="Active" source="active" />
        <ReferenceField
          label="Class"
          source="phaseparameter.id"
          reference="PhaseParameter"
        >
          <TextField source={PHASEPARAMETER_TITLE_FIELD} />
        </ReferenceField>
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <TextField label="Description" source="description" />
        <TextField label="Edited By" source="editedBy" />
        <ReferenceField
          label="Equipment Phase"
          source="equipmentphase.id"
          reference="EquipmentPhase"
        >
          <TextField source={EQUIPMENTPHASE_TITLE_FIELD} />
        </ReferenceField>
        <TextField label="ID" source="id" />
        <BooleanField label="Is Class Def" source="isClassDef" />
        <TextField label="Item ID" source="itemId" />
        <TextField label="Name" source="name" />
        <TextField label="Recipe ID" source="recipeId" />
        <TextField label="Revision" source="revision" />
        <TextField label="Schema Version" source="schemaVersion" />
        <BooleanField
          label="Setpoint Boolean Value"
          source="setpointBooleanValue"
        />
        <TextField label="Setpoint Lower Limit" source="setpointLowerLimit" />
        <TextField
          label="Setpoint Numerical Value"
          source="setpointNumericalValue"
        />
        <TextField label="Setpoint Type" source="setpointType" />
        <TextField label="Setpoint Upper Limit" source="setpointUpperLimit" />
        <TextField label="Type Revision" source="typeRevision" />
        <TextField label="Type Units" source="typeUnits" />
        <DateField source="updatedAt" label="Updated At" />
      </Datagrid>
    </List>
  );
};
