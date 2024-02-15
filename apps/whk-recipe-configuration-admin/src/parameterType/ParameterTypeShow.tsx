import * as React from "react";

import {
  Show,
  SimpleShowLayout,
  ShowProps,
  DateField,
  TextField,
  BooleanField,
  ReferenceManyField,
  Datagrid,
  ReferenceField,
} from "react-admin";

import { PARAMETERTYPE_TITLE_FIELD } from "./ParameterTypeTitle";

export const ParameterTypeShow = (props: ShowProps): React.ReactElement => {
  return (
    <Show {...props}>
      <SimpleShowLayout>
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <TextField label="Edited By" source="editedBy" />
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
        <ReferenceManyField
          reference="RecipeParameter"
          target="parameterTypeId"
          label="RecipeParameters"
        >
          <Datagrid rowClick="show">
            <BooleanField label="Active" source="active" />
            <TextField label="Batch" source="batch" />
            <TextField label="Class Name" source="className" />
            <DateField source="createdAt" label="Created At" />
            <TextField label="Created By" source="createdBy" />
            <DateField source="editedAt" label="Edited At" />
            <TextField label="Edited By" source="editedBy" />
            <TextField label="ID" source="id" />
            <TextField label="Item ID" source="itemId" />
            <ReferenceField
              label="Parameter Type"
              source="parametertype.id"
              reference="ParameterType"
            >
              <TextField source={PARAMETERTYPE_TITLE_FIELD} />
            </ReferenceField>
            <TextField
              label="Recipe Param Description"
              source="recipeParamDescription"
            />
            <TextField label="Recipe Param Name" source="recipeParamName" />
            <TextField
              label="Recipe Param Revision"
              source="recipeParamRevision"
            />
            <TextField label="Recipe Param Units" source="recipeParamUnits" />
            <BooleanField
              label="Recipe Setpoint Boolean Value"
              source="recipeSetpointBooleanValue"
            />
            <TextField
              label="Recipe Setpoint Lower Limit"
              source="recipeSetpointLowerLimit"
            />
            <TextField
              label="Recipe Setpoint Type"
              source="recipeSetpointType"
            />
            <TextField
              label="Recipe Setpoint Upper Limit"
              source="recipeSetpointUpperLimit"
            />
            <TextField label="Schema Version" source="schemaVersion" />
            <TextField
              label="Sequencer Parameters"
              source="sequencerParameters"
            />
          </Datagrid>
        </ReferenceManyField>
      </SimpleShowLayout>
    </Show>
  );
};
