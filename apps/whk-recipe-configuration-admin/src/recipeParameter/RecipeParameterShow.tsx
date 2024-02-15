import * as React from "react";
import {
  Show,
  SimpleShowLayout,
  ShowProps,
  BooleanField,
  TextField,
  DateField,
} from "react-admin";

export const RecipeParameterShow = (props: ShowProps): React.ReactElement => {
  return (
    <Show {...props}>
      <SimpleShowLayout>
        <BooleanField label="Active" source="active" />
        <TextField label="Batch" source="batch" />
        <TextField label="Class Name" source="className" />
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <DateField source="editedAt" label="Edited At" />
        <TextField label="Edited By" source="editedBy" />
        <TextField label="ID" source="id" />
        <TextField label="Item ID" source="itemId" />
        <TextField
          label="Recipe Param Description"
          source="recipeParamDescription"
        />
        <TextField label="Recipe Param Name" source="recipeParamName" />
        <TextField label="Recipe Param Revision" source="recipeParamRevision" />
        <TextField label="Recipe Param Units" source="recipeParamUnits" />
        <BooleanField
          label="Recipe Setpoint Boolean Value"
          source="recipeSetpointBooleanValue"
        />
        <TextField
          label="Recipe Setpoint Lower Limit"
          source="recipeSetpointLowerLimit"
        />
        <TextField label="Recipe Setpoint Type" source="recipeSetpointType" />
        <TextField
          label="Recipe Setpoint Upper Limit"
          source="recipeSetpointUpperLimit"
        />
        <TextField label="Schema Version" source="schemaVersion" />
        <TextField label="Sequencer Parameters" source="sequencerParameters" />
      </SimpleShowLayout>
    </Show>
  );
};
