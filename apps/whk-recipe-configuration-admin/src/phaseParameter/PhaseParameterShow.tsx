import * as React from "react";

import {
  Show,
  SimpleShowLayout,
  ShowProps,
  DateField,
  TextField,
  ReferenceField,
  BooleanField,
} from "react-admin";

import { EQUIPMENTPHASE_TITLE_FIELD } from "../equipmentPhase/EquipmentPhaseTitle";

export const PhaseParameterShow = (props: ShowProps): React.ReactElement => {
  return (
    <Show {...props}>
      <SimpleShowLayout>
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <TextField label="Edited By" source="editedBy" />
        <ReferenceField
          label="Equipment Phase"
          source="equipmentphase.id"
          reference="EquipmentPhase"
        >
          <TextField source={EQUIPMENTPHASE_TITLE_FIELD} />
        </ReferenceField>
        <TextField label="ID" source="id" />
        <TextField label="Item ID" source="itemId" />
        <TextField label="Recipe ID" source="recipeId" />
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
        <TextField label="Type Description" source="typeDescription" />
        <TextField label="Type Name" source="typeName" />
        <TextField label="Type Revision" source="typeRevision" />
        <TextField label="Type Units" source="typeUnits" />
        <DateField source="updatedAt" label="Updated At" />
      </SimpleShowLayout>
    </Show>
  );
};
