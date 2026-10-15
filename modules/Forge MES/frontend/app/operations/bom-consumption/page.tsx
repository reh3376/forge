"use client";

import { useState, useEffect } from "react";
import { useQuery, useLazyQuery } from "@apollo/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConsumptionRecordSheet } from "@/components/operations/consumption-record-sheet";
import {
  GET_ACTIVE_SCHEDULE_ORDERS,
  GET_SCHEDULE_ORDER_RECIPE_COMPONENTS,
  SORecipeBomItemType,
  SORecipeInstanceWithComponentsType,
  ScheduleOrderQueueItem,
} from "@/lib/api/graphql/bom-consumption";
import { AlertCircle, Clock, Package } from "lucide-react";

export default function BomConsumptionPage() {
  const [selectedItem, setSelectedItem] = useState<SORecipeBomItemType | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderComponents, setOrderComponents] = useState<Map<string, SORecipeInstanceWithComponentsType>>(new Map());

  // Fetch active schedule order queue items
  const { data, loading, error, refetch } = useQuery<{
    scheduleOrderQueues: ScheduleOrderQueueItem[];
  }>(GET_ACTIVE_SCHEDULE_ORDERS, {
    pollInterval: 30000, // Refresh every 30 seconds
  });

  // Lazy query to fetch order components when expanded
  const [fetchComponents, { loading: componentsLoading }] = useLazyQuery<{
    scheduleOrderRecipeInstanceWithComponents: SORecipeInstanceWithComponentsType;
  }>(GET_SCHEDULE_ORDER_RECIPE_COMPONENTS);

  // Fetch components when order is expanded
  useEffect(() => {
    if (selectedOrderId && !orderComponents.has(selectedOrderId)) {
      fetchComponents({
        variables: { scheduleOrderId: selectedOrderId },
        onCompleted: (data) => {
          if (data.scheduleOrderRecipeInstanceWithComponents) {
            setOrderComponents(prev => new Map(prev).set(
              selectedOrderId,
              data.scheduleOrderRecipeInstanceWithComponents
            ));
          }
        },
        onError: (err) => {
          console.error("[BomConsumption] Failed to fetch components:", err);
        }
      });
    }
  }, [selectedOrderId, orderComponents, fetchComponents]);

  const handleRecordSuccess = () => {
    // Clear components cache to force refetch
    if (selectedOrderId) {
      setOrderComponents(prev => {
        const next = new Map(prev);
        next.delete(selectedOrderId);
        return next;
      });
    }
    refetch();
  };

  const handleOrderToggle = (orderId: string) => {
    setSelectedOrderId(prev => prev === orderId ? null : orderId);
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <Clock className="h-12 w-12 animate-spin mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Loading active orders...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load orders: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const queueItems = data?.scheduleOrderQueues || [];
  // Filter out items without a valid schedule order
  const validQueueItems = queueItems.filter(item => item.scheduleOrder);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">BOM Consumption Tracking</h1>
          <p className="text-muted-foreground mt-1">
            Record material consumption with lot traceability for queued orders
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {/* Active Orders in Queue */}
      {validQueueItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
            <Package className="h-16 w-16 text-muted-foreground" />
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">No Orders in Queue</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                There are no schedule orders in the active queue requiring BOM consumption tracking.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {validQueueItems.map((queueItem) => {
            const order = queueItem.scheduleOrder!;
            const isSelected = selectedOrderId === order.id;
            const components = orderComponents.get(order.id);
            const allBomItems = components?.recipeBoms?.flatMap((bom) => bom.recipeBomITem || []) || [];

            const isRunning = order.status === "InProgress";
            const productionOrders = order.productionOrders || [];
            const areas = queueItem.areas || [];

            return (
              <Card key={queueItem.id} className={isSelected ? "border-primary" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Queue Badge and Order Name */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge
                          variant={queueItem.queueIndex === 0 ? "default" : "secondary"}
                          className="text-sm font-semibold px-3 py-1"
                        >
                          Queue {queueItem.queueIndex ?? "?"}
                        </Badge>
                        {isRunning && (
                          <Badge className="bg-green-600 hover:bg-green-700 text-white font-semibold px-3 py-1">
                            Running
                          </Badge>
                        )}
                        <Badge
                          variant="secondary"
                          className="capitalize font-medium px-3 py-1"
                        >
                          {order.status}
                        </Badge>
                      </div>

                      <CardTitle className="text-lg sm:text-xl mb-2">
                        <span
                          className="font-mono tracking-tight"
                          title={order.name}
                        >
                          {order.name && order.name.length > 30
                            ? `${order.name.substring(0, 30)}...`
                            : order.name}
                        </span>
                      </CardTitle>

                      {/* Recipe Info */}
                      {components?.recipe && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                          <span className="font-medium">Recipe:</span>
                          <span>
                            {components.recipe.name}
                            {components.recipe.revision && ` (Rev ${components.recipe.revision})`}
                          </span>
                        </div>
                      )}

                      {/* Production Orders */}
                      {productionOrders.length > 0 && (
                        <div className="flex flex-col gap-1 mb-2">
                          <span className="text-sm font-medium text-muted-foreground">
                            Production Orders:
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {productionOrders.map((po) => (
                              <div
                                key={po.id}
                                className="text-xs bg-accent px-2 py-1 rounded-md"
                              >
                                <span className="font-medium">{po.name}</span>
                                {po.customer?.name && (
                                  <span className="text-muted-foreground ml-1">
                                    • {po.customer.name}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Current Area */}
                      {isRunning && areas.length > 0 && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-muted-foreground">Area:</span>
                          <div className="flex flex-wrap gap-1">
                            {areas.map((area) => (
                              <Badge key={area.id} variant="secondary" className="text-xs">
                                {area.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Estimated Timeline */}
                      {(order.estimatedStart || order.estimatedEnd) && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2 text-xs text-muted-foreground">
                          {order.estimatedStart && (
                            <span>
                              Start: {new Date(order.estimatedStart).toLocaleString()}
                            </span>
                          )}
                          {order.estimatedEnd && (
                            <span>
                              End: {new Date(order.estimatedEnd).toLocaleString()}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <Button
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleOrderToggle(order.id)}
                      disabled={componentsLoading}
                      className="w-full sm:w-auto"
                    >
                      {isSelected ? "Collapse" : "View Materials"}
                    </Button>
                  </div>
                </CardHeader>

                {isSelected && (
                  <CardContent>
                    {componentsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">
                          Loading materials...
                        </span>
                      </div>
                    ) : allBomItems.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No BOM items found for this order
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="hidden sm:flex items-center justify-between text-sm font-medium mb-2 px-3">
                          <span>Material</span>
                          <span>Actions</span>
                        </div>

                        {allBomItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors gap-3"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-base mb-1 break-words">
                                {item.item?.itemName}
                              </div>
                              <div className="text-sm text-muted-foreground mb-2">
                                {item.item?.itemNumber}
                              </div>
                              <div className="inline-flex items-center gap-2 text-sm bg-muted px-2 py-1 rounded">
                                <span className="font-medium">Required:</span>
                                <span>
                                  {item.quantity?.toFixed(2) || 0} {item.displayUnits?.abbreviation}
                                </span>
                              </div>
                            </div>

                            <Button
                              size="sm"
                              onClick={() => setSelectedItem(item)}
                              className="w-full sm:w-auto"
                            >
                              Record Consumption
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Consumption Record Sheet */}
      {selectedItem && (
        <ConsumptionRecordSheet
          item={selectedItem}
          isOpen={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          onSuccess={handleRecordSuccess}
        />
      )}
    </div>
  );
}
