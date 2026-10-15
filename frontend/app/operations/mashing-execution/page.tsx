"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@apollo/client";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  MashingStepStateBadge,
  StepStateLegend,
} from "@/components/operations/mashing/mashing-step-state-badge";
import {
  GET_MASHING_SCHEDULE_ORDERS,
  GET_MASHING_STATE,
  MashingScheduleOrderItem,
  MashingStateResponse,
} from "@/lib/api/graphql/mashing-execution";
import {
  AlertCircle,
  Clock,
  Thermometer,
  ChevronRight,
  RefreshCw,
  Beaker,
} from "lucide-react";

interface MashingExecutionCardProps {
  queueItem: MashingScheduleOrderItem;
}

/**
 * Card component for a single schedule order with mashing state
 */
function MashingExecutionCard({ queueItem }: MashingExecutionCardProps) {
  const scheduleOrder = queueItem.scheduleOrder;
  const scheduleOrderId = scheduleOrder?.id;

  // Fetch mashing state for this specific order
  const { data: stateData, loading: stateLoading } = useQuery<{
    mashingState: MashingStateResponse;
  }>(GET_MASHING_STATE, {
    variables: { scheduleOrderId },
    skip: !scheduleOrderId,
    pollInterval: 10000, // Update every 10 seconds
  });

  const mashingState = stateData?.mashingState;

  // Determine order display info
  const isRunning = scheduleOrder?.status === "InProgress";
  const queuePosition = queueItem.queueIndex ?? 0;

  // Calculate progress
  const totalSteps = mashingState
    ? (mashingState.completedSteps?.length || 0) +
      (mashingState.currentStep ? 1 : 0) +
      (mashingState.pendingSteps?.length || 0)
    : 0;
  const completedSteps = mashingState?.completedSteps?.length || 0;
  const progressPercent =
    mashingState?.overallProgress || (totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0);

  return (
    <Card className={isRunning ? "border-green-500/50" : ""}>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Queue Badge and Order Name */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge
                variant={queuePosition === 0 ? "default" : "secondary"}
                className="text-sm font-semibold px-3 py-1"
              >
                {queuePosition === 0 ? "Active" : `Queue ${queuePosition}`}
              </Badge>
              {isRunning && (
                <Badge className="bg-green-600 hover:bg-green-700 text-white font-semibold px-3 py-1">
                  Running
                </Badge>
              )}
              <Badge variant="outline" className="capitalize font-medium px-3 py-1">
                {scheduleOrder?.status || "Unknown"}
              </Badge>
            </div>

            <CardTitle className="text-lg sm:text-xl mb-2">
              <span className="font-mono tracking-tight" title={scheduleOrder?.name || ""}>
                {scheduleOrder?.name && scheduleOrder.name.length > 35
                  ? `${scheduleOrder.name.substring(0, 35)}...`
                  : scheduleOrder?.name || "Unknown Order"}
              </span>
            </CardTitle>

            {/* Current Step Info */}
            {stateLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 animate-spin" />
                <span>Loading mashing state...</span>
              </div>
            ) : mashingState?.currentStep ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Current Step:
                  </span>
                  <span className="text-sm font-semibold">
                    {mashingState.currentStep.stepName}
                  </span>
                  <MashingStepStateBadge
                    state={mashingState.currentStep.state}
                    size="sm"
                  />
                </div>

                {/* Target Temperature */}
                {mashingState.currentStep.targetTemperature && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Thermometer className="h-4 w-4" />
                    <span>
                      Target: {mashingState.currentStep.targetTemperature}°F
                    </span>
                  </div>
                )}
              </div>
            ) : mashingState?.pendingSteps?.length ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Beaker className="h-4 w-4" />
                <span>Ready to start mashing</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>No mashing protocol found</span>
              </div>
            )}

            {/* Progress Bar */}
            {totalSteps > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>
                    {completedSteps} / {totalSteps} steps ({Math.round(progressPercent)}%)
                  </span>
                </div>
                <Progress value={progressPercent} className="h-2" />
              </div>
            )}

            {/* Timeline Info */}
            {(scheduleOrder?.estimatedStart || scheduleOrder?.estimatedEnd) && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-3 text-xs text-muted-foreground">
                {scheduleOrder.estimatedStart && (
                  <span>
                    Start: {new Date(scheduleOrder.estimatedStart).toLocaleString()}
                  </span>
                )}
                {scheduleOrder.estimatedEnd && (
                  <span>
                    End: {new Date(scheduleOrder.estimatedEnd).toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Link href={`/operations/mashing-execution/${scheduleOrder?.id}`}>
              <Button
                variant="default"
                size="sm"
                className="w-full sm:w-auto"
                disabled={!scheduleOrderId}
              >
                {mashingState?.currentStep ? "View Steps" : "Start Mashing"}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

/**
 * Mashing Execution List Page
 * Shows all schedule orders currently in mashing phase
 */
export default function MashingExecutionPage() {
  // Fetch active schedule orders
  const { data, loading, error, refetch } = useQuery<{
    scheduleOrderQueues: MashingScheduleOrderItem[];
  }>(GET_MASHING_SCHEDULE_ORDERS, {
    pollInterval: 30000, // Refresh list every 30 seconds
  });

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <Clock className="h-12 w-12 animate-spin mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Loading mashing operations...</p>
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
            Failed to load operations: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const queueItems = data?.scheduleOrderQueues || [];
  // Filter to only show items with valid schedule orders
  const validQueueItems = queueItems.filter((item) => item.scheduleOrder);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mashing Execution</h1>
          <p className="text-muted-foreground mt-1">
            Track and control mashing operations using S88 step execution
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StepStateLegend className="hidden md:flex" />
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Legend for mobile */}
      <div className="md:hidden">
        <StepStateLegend />
      </div>

      {/* Order List */}
      {validQueueItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
            <Beaker className="h-16 w-16 text-muted-foreground" />
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">No Active Mashing Operations</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                There are no schedule orders in the active queue requiring mashing
                execution tracking.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {validQueueItems.map((queueItem) => (
            <MashingExecutionCard key={queueItem.id} queueItem={queueItem} />
          ))}
        </div>
      )}
    </div>
  );
}
