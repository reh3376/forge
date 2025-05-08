import React, { useState, useEffect } from "react";
import {
  List,
  Datagrid,
  TextField,
  DateField,
  BooleanField,
  FunctionField,
  SearchInput,
  Filter,
  FilterLiveSearch,
  SelectInput,
  DateInput,
  useNotify,
  Button,
  useDataProvider,
  TopToolbar,
  CreateButton,
  ExportButton,
  FilterButton,
  useRefresh,
} from "react-admin";
import { Card, CardContent, Box, Chip, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { format } from "date-fns";

const MessageQueueFilters = [
  <FilterLiveSearch source="entityId" label="Entity ID" />,
  <SelectInput
    source="status"
    label="Status"
    choices={[
      { id: "PENDING", name: "Pending" },
      { id: "SENT", name: "Sent" },
      { id: "ACKNOWLEDGED", name: "Acknowledged" },
      { id: "FAILED", name: "Failed" },
      { id: "RETRYING", name: "Retrying" },
    ]}
  />,
  <SelectInput
    source="entityType"
    label="Entity Type"
    choices={[
      { id: "ItemReceipt", name: "Item Receipt" },
      { id: "PurchaseOrder", name: "Purchase Order" },
      { id: "Inventory", name: "Inventory" },
    ]}
  />,
  <DateInput source="createdAt_gte" label="Created After" />,
  <DateInput source="createdAt_lte" label="Created Before" />,
];

const ListActions = () => {
  const refresh = useRefresh();
  const dataProvider = useDataProvider();
  const notify = useNotify();

  const handleRetryAll = async () => {
    try {
      await dataProvider.custom({
        method: "POST",
        url: "/api/message-queue/retry-all",
      });
      notify("All failed messages have been queued for retry", { type: "success" });
      refresh();
    } catch (error) {
      notify("Error retrying messages", { type: "error" });
    }
  };

  return (
    <TopToolbar>
      <FilterButton />
      <ExportButton />
      <Button
        label="Retry Failed"
        onClick={handleRetryAll}
        color="primary"
      />
      <Button
        label="Refresh"
        onClick={refresh}
        color="primary"
      >
        <RefreshIcon />
      </Button>
    </TopToolbar>
  );
};

const StatusField = ({ record }) => {
  if (!record) return null;

  let color;
  switch (record.status) {
    case "ACKNOWLEDGED":
      color = "success";
      break;
    case "FAILED":
      color = "error";
      break;
    case "PENDING":
      color = "warning";
      break;
    case "SENT":
      color = "info";
      break;
    case "RETRYING":
      color = "secondary";
      break;
    default:
      color = "default";
  }

  return <Chip label={record.status} color={color} size="small" />;
};

const MessageQueueList = (props) => {
  const [stats, setStats] = useState({
    total: 0,
    acknowledged: 0,
    failed: 0,
    pending: 0,
    sent: 0,
    retrying: 0,
  });
  
  const dataProvider = useDataProvider();
  const refresh = useRefresh();
  
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await dataProvider.custom({
          method: "GET",
          url: "/api/message-queue/stats",
        });
        setStats(data);
      } catch (error) {
        console.error("Failed to load message queue stats", error);
      }
    };
    
    fetchStats();
    // Set up a refresh interval
    const interval = setInterval(() => {
      refresh();
      fetchStats();
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, [dataProvider, refresh]);

  return (
    <>
      <Box mb={2}>
        <Card>
          <CardContent>
            <Typography variant="h6">Message Queue Statistics</Typography>
            <Box display="flex" flexWrap="wrap" gap={2} mt={2}>
              <Chip label={`Total: ${stats.total}`} color="default" />
              <Chip label={`Acknowledged: ${stats.acknowledged}`} color="success" />
              <Chip label={`Failed: ${stats.failed}`} color="error" />
              <Chip label={`Pending: ${stats.pending}`} color="warning" />
              <Chip label={`Sent: ${stats.sent}`} color="info" />
              <Chip label={`Retrying: ${stats.retrying}`} color="secondary" />
            </Box>
          </CardContent>
        </Card>
      </Box>
    
      <List
        {...props}
        filters={MessageQueueFilters}
        actions={<ListActions />}
        sort={{ field: "createdAt", order: "DESC" }}
      >
        <Datagrid rowClick="show">
          <TextField source="id" />
          <TextField source="entityType" />
          <TextField source="entityId" />
          <StatusField source="status" />
          <TextField source="attempts" />
          <DateField source="lastAttemptAt" showTime />
          <DateField source="acknowledgedAt" showTime />
          <DateField source="createdAt" showTime />
          <FunctionField
            label="Retry"
            render={(record) => {
              if (record.status === "FAILED" || record.status === "PENDING") {
                return (
                  <Button
                    label="Retry"
                    onClick={(e) => {
                      e.stopPropagation();
                      dataProvider
                        .custom({
                          method: "POST",
                          url: `/api/message-queue/retry/${record.id}`,
                        })
                        .then(() => {
                          refresh();
                        });
                    }}
                  >
                    Retry
                  </Button>
                );
              }
              return null;
            }}
          />
        </Datagrid>
      </List>
    </>
  );
};

export default MessageQueueList; 