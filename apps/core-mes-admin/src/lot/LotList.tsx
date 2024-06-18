import * as React from "react";
import { List, Datagrid, ListProps, DateField, TextField } from "react-admin";
import Pagination from "../Components/Pagination";

export const LotList = (props: ListProps): React.ReactElement => {
  return (
    <List
      {...props}
      bulkActionButtons={false}
      title={"Lots"}
      perPage={50}
      pagination={<Pagination />}
    >
      <Datagrid rowClick="show">
        <DateField source="createdAt" label="Created At" />
        <TextField label="CreatedBy" source="createdBy" />
        <TextField label="ID" source="id" />
        <TextField label="Item" source="item" />
        <TextField
          label="Purchase Order Loaded In"
          source="purchaseOrderLoadedIn"
        />
        <TextField
          label="Purchase Order Rejected Lot"
          source="purchaseOrderRejectedLot"
        />
        <DateField source="updatedAt" label="Updated At" />
        <TextField label="UpdatedBy" source="updatedBy" />
      </Datagrid>
    </List>
  );
};
