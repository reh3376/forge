import * as React from "react";

import {
  List,
  Datagrid,
  ListProps,
  BooleanField,
  TextField,
  ReferenceField,
  DateField,
} from "react-admin";

import Pagination from "../Components/Pagination";
import { RECIPEPARAMETER_TITLE_FIELD } from "./RecipeParameterTitle";

export const RecipeParameterList = (props: ListProps): React.ReactElement => {
  return (
    <List
      {...props}
      bulkActionButtons={false}
      title={"RecipeParameters"}
      perPage={50}
      pagination={<Pagination />}
    >
      <Datagrid rowClick="show">
        <BooleanField label="Active" source="active" />
        <TextField label="Batch" source="batch" />
        <ReferenceField
          label="Class ID"
          source="recipeparameter.id"
          reference="RecipeParameter"
        >
          <TextField source={RECIPEPARAMETER_TITLE_FIELD} />
        </ReferenceField>
        <TextField label="Class Name" source="className" />
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <DateField source="editedAt" label="Edited At" />
        <TextField label="Edited By" source="editedBy" />
        <TextField label="ID" source="id" />
        <BooleanField label="Is Class Definition" source="isClassDefinition" />
        <TextField label="Item ID" source="itemId" />
        <TextField
          label="Recipe Param Description"
          source="recipeParamDescription"
        />
        <TextField label="Recipe Param Name" source="recipeParamName" />
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
        <TextField label="Revision" source="revision" />
        <TextField label="Schema Version" source="schemaVersion" />
        <TextField label="Sequencer Parameters" source="sequencerParameters" />
      </Datagrid>
    </List>
  );
};
