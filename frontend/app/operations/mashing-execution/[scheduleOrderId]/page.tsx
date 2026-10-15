"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "@apollo/client";
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
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  MashingStepStateBadge,
  StepStateDot,
  canStartStep,
  isTerminalState,
} from "@/components/operations/mashing/mashing-step-state-badge";
import { MashingStepExecutionSheet } from "@/components/operations/mashing/mashing-step-execution-sheet";
import {
  GET_MASHING_STATE,
  START_MASHING_STEP,
  MashingStateResponse,
  MashingStepState,
  PendingMashingStep,
  CompletedMashingStep,
  StepExecutionOutput,
} from "@/lib/api/graphql/mashing-execution";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  Clock,
  PlayCircle,
  RefreshCw,
  Thermometer,
  Timer,
  Beaker,
} from "lucide-react";

/**
 * Mashing Execution Detail Page
 * Full step-by-step mashing workflow for a single schedule order
 */
export default function MashingExecutionDetailPage() {
  const params = useParams();
  const scheduleOrderId = params?.["scheduleOrderId"] as string;
  const { toast } = useToast();

  // Selected step for the execution sheet
  const [selectedStep, setSelectedStep] = useState<MashingStepState | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Fetch mashing state
  const { data, loading, error, refetch } = useQuery<{
    mashingState: MashingStateResponse;
  }>(GET_MASHING_STATE, {
    variables: { scheduleOrderId },
    pollInterval: 5000, // Update every 5 seconds for real-time feel
    skip: !scheduleOrderId,
  });

  // Start step mutation
  const [startMashingStep, { loading: startLoading }] = useMutation<{
    startMashingStep: StepExecutionOutput;
  }>(START_MASHING_STEP, {
    onCompleted: () => {
      toast({
        title: "Step Started",
        description: "Mashing step has been started",
      });
      refetch();
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Failed to Start Step",
        description: err.message,
      });
    },
  });

  const mashingState = data?.mashingState;

  // Calculate overall progress
  const totalSteps = mashingState
    ? (mashingState.completedSteps?.length || 0) +
      (mashingState.currentStep ? 1 : 0) +
      (mashingState.pendingSteps?.length || 0)
    : 0;
  const completedCount = mashingState?.completedSteps?.length || 0;
  const progressPercent = mashingState?.overallProgress || 0;

  // Handle starting the next step
  const handleStartStep = async (stepId: string) => {
    await startMashingStep({
      variables: {
        scheduleOrderId,
        mashingProtocolStepId: stepId,
      },
    });
  };

  // Handle opening the execution sheet for current step
  const handleOpenCurrentStep = () => {
    if (mashingState?.currentStep) {
      setSelectedStep(mashingState.currentStep);
      setIsSheetOpen(true);
    }
  };

  // Handle sheet close
  const handleSheetClose = () => {
    setIsSheetOpen(false);
    setSelectedStep(null);
  };

  // Handle sheet success
  const handleSheetSuccess = () => {
    refetch();
  };

  // Format duration in minutes
  const formatDuration = (minutes?: number): string => {
    if (!minutes) return "N/A";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  // Format seconds as MM:SS or H:MM:SS
  const formatSeconds = (seconds?: number): string => {
    if (!seconds) return "0:00";
    const totalSecs = Math.floor(seconds);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <Clock className="h-12 w-12 animate-spin mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Loading mashing state...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <Link href="/operations/mashing-execution">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>
        </Link>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load mashing state: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!mashingState) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <Link href="/operations/mashing-execution">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-4">
            <Beaker className="h-12 w-12 text-muted-foreground" />
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">No Mashing Data Found</h3>
              <p className="text-sm text-muted-foreground">
                Unable to retrieve mashing state for this order.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/operations/mashing-execution">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Mashing Execution</h1>
            <p className="text-muted-foreground text-sm">
              Order: {scheduleOrderId.substring(0, 8)}...
              {mashingState.batchId && (
                <span className="ml-2">Batch: {mashingState.batchId}</span>
              )}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Progress Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Overall Progress</CardTitle>
          <CardDescription>
            {completedCount} of {totalSteps} steps completed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={progressPercent} className="h-3" />
          <div className="flex justify-between mt-2 text-sm text-muted-foreground">
            <span>0%</span>
            <span className="font-medium">{Math.round(progressPercent)}%</span>
            <span>100%</span>
          </div>
        </CardContent>
      </Card>

      {/* Current Step Card */}
      {mashingState.currentStep && (
        <Card className="border-green-500/50 bg-green-50/30 dark:bg-green-900/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Current Step</CardTitle>
                <MashingStepStateBadge state={mashingState.currentStep.state} />
              </div>
              <Badge variant="outline">
                Step {completedCount + 1}
              </Badge>
            </div>
            <CardDescription>{mashingState.currentStep.stepName}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6 mb-4">
              {/* Target Temperature - only show if relevant */}
              {mashingState.currentStep.targetTemperature && (
                <div className="flex items-center gap-2">
                  <Thermometer className="h-5 w-5 text-orange-500" />
                  <div>
                    <div className="text-xs text-muted-foreground">Target Temp</div>
                    <div className="font-semibold">
                      {mashingState.currentStep.targetTemperature}°F
                    </div>
                  </div>
                </div>
              )}

              {/* Target Duration - only show if relevant */}
              {mashingState.currentStep.targetDuration && (
                <div className="flex items-center gap-2">
                  <Timer className="h-5 w-5 text-blue-500" />
                  <div>
                    <div className="text-xs text-muted-foreground">Target Duration</div>
                    <div className="font-semibold">
                      {formatSeconds(mashingState.currentStep.targetDuration)}
                    </div>
                  </div>
                </div>
              )}

              {/* Elapsed Time - always show when running */}
              {mashingState.currentStep.actualStartTime && (
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-green-500" />
                  <div>
                    <div className="text-xs text-muted-foreground">Elapsed</div>
                    <div className="font-semibold font-mono">
                      {formatSeconds(mashingState.currentStep.elapsedSeconds)}
                    </div>
                  </div>
                </div>
              )}

              {/* Step Type badge */}
              {mashingState.currentStep.stepType && (
                <div className="flex items-center gap-2">
                  <Beaker className="h-5 w-5 text-purple-500" />
                  <div>
                    <div className="text-xs text-muted-foreground">Step Type</div>
                    <div className="font-semibold">
                      {mashingState.currentStep.stepType}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Button */}
            <Button
              onClick={handleOpenCurrentStep}
              className="w-full sm:w-auto"
            >
              {mashingState.currentStep.state === "Running" ? (
                <>
                  <Thermometer className="h-4 w-4 mr-2" />
                  Record Actuals
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Manage Step
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pending Steps */}
      {mashingState.pendingSteps && mashingState.pendingSteps.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Pending Steps</CardTitle>
            <CardDescription>
              {mashingState.pendingSteps.length} step(s) remaining
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {mashingState.pendingSteps.map((step, index) => {
                const isNextStep = index === 0 && !mashingState.currentStep;
                // Display position: completed steps + current step (if any) + position in pending list
                const displayNumber = completedCount + (mashingState.currentStep ? 1 : 0) + index + 1;
                return (
                  <div
                    key={step.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isNextStep
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-medium">
                        {displayNumber}
                      </div>
                      <div>
                        <div className="font-medium">
                          {step.stepType || `Step ${displayNumber}`}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-3">
                          {step.temperatureSetpoint && (
                            <span className="flex items-center gap-1">
                              <Thermometer className="h-3 w-3" />
                              {step.temperatureSetpoint}°F
                            </span>
                          )}
                          {step.stepTime && (
                            <span className="flex items-center gap-1">
                              <Timer className="h-3 w-3" />
                              {formatDuration(step.stepTime)}
                            </span>
                          )}
                        </div>
                        {step.promptMessage && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {step.promptMessage}
                          </div>
                        )}
                      </div>
                    </div>

                    {isNextStep && (
                      <Button
                        size="sm"
                        onClick={() => handleStartStep(step.id)}
                        disabled={startLoading}
                      >
                        <PlayCircle className="h-4 w-4 mr-1" />
                        {startLoading ? "Starting..." : "Start"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completed Steps */}
      {mashingState.completedSteps && mashingState.completedSteps.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Completed Steps
            </CardTitle>
            <CardDescription>
              {mashingState.completedSteps.length} step(s) completed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {mashingState.completedSteps.map((step) => (
                <div
                  key={step.stepExecutionId}
                  className="flex items-center justify-between p-3 rounded-lg border border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-900/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400">
                      <CheckCircle className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">{step.stepName}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-3">
                        {step.actualTemperature !== undefined && (
                          <span className="flex items-center gap-1">
                            <Thermometer className="h-3 w-3" />
                            {step.actualTemperature}°F
                          </span>
                        )}
                        {step.actualDuration !== undefined && (
                          <span className="flex items-center gap-1">
                            <Timer className="h-3 w-3" />
                            {formatSeconds(step.actualDuration)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {step.completedAt && (
                    <div className="text-xs text-muted-foreground">
                      {new Date(step.completedAt).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Done State */}
      {!mashingState.currentStep &&
        mashingState.pendingSteps?.length === 0 &&
        mashingState.completedSteps?.length > 0 && (
          <Alert className="border-green-500/50 bg-green-50/30 dark:bg-green-900/10">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription>
              <strong>Mashing Complete!</strong> All steps have been successfully
              completed for this batch.
            </AlertDescription>
          </Alert>
        )}

      {/* Step Execution Sheet */}
      {selectedStep && (
        <MashingStepExecutionSheet
          step={selectedStep}
          isOpen={isSheetOpen}
          onClose={handleSheetClose}
          onSuccess={handleSheetSuccess}
        />
      )}
    </div>
  );
}
