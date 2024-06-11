import * as React from "react";
import {
  List,
  Datagrid,
  ListProps,
  DateField,
  TextField,
  ReferenceField,
} from "react-admin";
import Pagination from "../Components/Pagination";
import { LOT_TITLE_FIELD } from "../lot/LotTitle";

export const BarrelList = (props: ListProps): React.ReactElement => {
  return (
    <List
      {...props}
      bulkActionButtons={false}
      title={"Barrels"}
      perPage={50}
      pagination={<Pagination />}
    >
      <Datagrid rowClick="show">
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
      </Datagrid>
    </List>
  );
};
