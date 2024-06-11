import * as React from "react";
import {
  Show,
  SimpleShowLayout,
  ShowProps,
  DateField,
  TextField,
  ReferenceField,
} from "react-admin";
import { LOT_TITLE_FIELD } from "../lot/LotTitle";

export const BarrelShow = (props: ShowProps): React.ReactElement => {
  return (
    <Show {...props}>
      <SimpleShowLayout>
        <DateField source="createdAt" label="Created At" />
        <TextField label="Created By" source="createdBy" />
        <TextField label="Filled At" source="filledAt" />
        <TextField label="Filled By" source="filledBy" />
        <TextField label="ID" source="id" />
        <ReferenceField label="Lot" source="lot.id" reference="Lot">
          <TextField source={LOT_TITLE_FIELD} />
        </ReferenceField>
        <TextField label="SerialNumber" source="serialNumber" />
        <DateField source="updatedAt" label="Updated At" />
        <TextField label="Updated By" source="updatedBy" />
      </SimpleShowLayout>
    </Show>
  );
};
