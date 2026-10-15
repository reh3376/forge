"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@apollo/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  MashingStepStateBadge,
  canCompleteStep,
  canPauseStep,
  canResumeStep,
  canHoldStep,
  canAbortStep,
} from "./mashing-step-state-badge";
import {
  COMPLETE_MASHING_STEP,
  PAUSE_MASHING_STEP,
  RESUME_MASHING_STEP,
  HOLD_MASHING_STEP,
  ABORT_MASHING_STEP,
  GET_STEP_PARAMETER_DEFINITIONS,
  MashingStepState,
  MashingStepCompletionResult,
  StepExecutionOutput,
  MashingStepParameterDefinition,
  ParameterActualInput,
  MaterialConsumptionInput,
  LinkedBomItem,
} from "@/lib/api/graphql/mashing-execution";
import {
  AlertTriangle,
  Thermometer,
  Clock,
  PlayCircle,
  PauseCircle,
  CheckCircle,
  XCircle,
  AlertCircle,
  Package,
  FlaskConical,
} from "lucide-react";

// Step types that involve material consumption
const MATERIAL_STEP_TYPES = ['GrainAdd', 'Corn', 'Wheat', 'Rye', 'Malt', 'PreMalt', 'SpecialtyGrainAdd', 'AdditiveAdd', 'LiquidAdd'];

interface MashingStepExecutionSheetProps {
  step: MashingStepState;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function MashingStepExecutionSheet({
  step,
  isOpen,
  onClose,
  onSuccess,
}: MashingStepExecutionSheetProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    actualTemperature: "",
    notes: "",
    reason: "",
  });
  const [elapsedTime, setElapsedTime] = useState(0);
  const [parameterValues, setParameterValues] = useState<Record<string, any>>({});
  const [materialConsumptions, setMaterialConsumptions] = useState<Record<string, MaterialConsumptionInput>>({});

  // Determine if this is a material step type
  const isMaterialStep = step.stepType && MATERIAL_STEP_TYPES.includes(step.stepType);

  // Query parameter definitions for this step type
  const { data: paramDefData } = useQuery<{
    mashingStepParameterDefinitions: MashingStepParameterDefinition[];
  }>(GET_STEP_PARAMETER_DEFINITIONS, {
    variables: { stepType: step.stepType },
    skip: !step.stepType,
  });

  const parameterDefinitions = paramDefData?.mashingStepParameterDefinitions || [];

  // Initialize material consumption tracking when step opens
  useEffect(() => {
    if (step.linkedBomItems && step.linkedBomItems.length > 0) {
      const initialConsumptions: Record<string, MaterialConsumptionInput> = {};
      step.linkedBomItems.forEach((bom) => {
        initialConsumptions[bom.id] = {
          recipeBomItemId: bom.id,
          quantityActual: bom.quantityPlanned ? Number(bom.quantityPlanned.toFixed(2)) : 0,
        };
      });
      setMaterialConsumptions(initialConsumptions);
    }
  }, [step.linkedBomItems]);

  // Calculate elapsed time from step start
  useEffect(() => {
    if (step.state === "Running" && step.actualStartTime) {
      const startTime = new Date(step.actualStartTime).getTime();

      const updateElapsed = () => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        setElapsedTime(elapsed);
      };

      updateElapsed();
      const interval = setInterval(updateElapsed, 1000);
      return () => clearInterval(interval);
    } else if (step.elapsedSeconds) {
      setElapsedTime(step.elapsedSeconds);
    }
  }, [step.state, step.actualStartTime, step.elapsedSeconds]);

  // Mutations
  const [completeMashingStep, { loading: completeLoading }] = useMutation<{
    completeMashingStep: MashingStepCompletionResult;
  }>(COMPLETE_MASHING_STEP, {
    onCompleted: (data) => {
      const { deviations } = data.completeMashingStep;

      if (deviations.length > 0) {
        toast({
          variant: "destructive",
          title: "Step Completed with Deviations",
          description: `${deviations.length} deviation(s) detected and logged`,
        });
      } else {
        toast({
          title: "Step Completed",
          description: "Mashing step completed successfully",
        });
      }
      onSuccess?.();
      handleClose();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to Complete Step",
        description: error.message,
      });
    },
  });

  const [pauseMashingStep, { loading: pauseLoading }] = useMutation<{
    pauseMashingStep: StepExecutionOutput;
  }>(PAUSE_MASHING_STEP, {
    onCompleted: () => {
      toast({
        title: "Step Paused",
        description: "Mashing step has been paused",
      });
      onSuccess?.();
      handleClose();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to Pause Step",
        description: error.message,
      });
    },
  });

  const [resumeMashingStep, { loading: resumeLoading }] = useMutation<{
    resumeMashingStep: StepExecutionOutput;
  }>(RESUME_MASHING_STEP, {
    onCompleted: () => {
      toast({
        title: "Step Resumed",
        description: "Mashing step has been resumed",
      });
      onSuccess?.();
      handleClose();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to Resume Step",
        description: error.message,
      });
    },
  });

  const [holdMashingStep, { loading: holdLoading }] = useMutation<{
    holdMashingStep: StepExecutionOutput;
  }>(HOLD_MASHING_STEP, {
    onCompleted: () => {
      toast({
        variant: "destructive",
        title: "Step Held",
        description: "Mashing step has been held for investigation",
      });
      onSuccess?.();
      handleClose();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to Hold Step",
        description: error.message,
      });
    },
  });

  const [abortMashingStep, { loading: abortLoading }] = useMutation<{
    abortMashingStep: StepExecutionOutput;
  }>(ABORT_MASHING_STEP, {
    onCompleted: () => {
      toast({
        variant: "destructive",
        title: "Step Aborted",
        description: "Mashing step has been aborted",
      });
      onSuccess?.();
      handleClose();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to Abort Step",
        description: error.message,
      });
    },
  });

  const isLoading =
    completeLoading ||
    pauseLoading ||
    resumeLoading ||
    holdLoading ||
    abortLoading;

  // Format elapsed time as MM:SS or HH:MM:SS
  const formatElapsedTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  // Format target duration (in seconds) as minutes
  const formatTargetDuration = (seconds?: number): string => {
    if (!seconds) return "N/A";
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
  };

  // Build parameter actuals from form values
  const buildParameterActuals = (): ParameterActualInput[] => {
    return parameterDefinitions
      .filter((def) => parameterValues[def.parameterName] !== undefined)
      .map((def) => {
        const value = parameterValues[def.parameterName];
        const actual: ParameterActualInput = {
          parameterName: def.parameterName,
        };

        switch (def.parameterType) {
          case 'Float':
          case 'Int':
            actual.valueActual = parseFloat(value);
            break;
          case 'Boolean':
            actual.booleanValueActual = value === true || value === 'true';
            break;
          case 'Text':
          case 'Enum':
            actual.textValueActual = value;
            break;
        }

        return actual;
      });
  };

  // Build material consumption array
  const buildMaterialConsumptions = (): MaterialConsumptionInput[] => {
    return Object.values(materialConsumptions).filter(
      (mc) => mc.quantityActual > 0
    );
  };

  // Handlers
  const handleComplete = async () => {
    const temperature = parseFloat(formData.actualTemperature);
    if (isNaN(temperature)) {
      toast({
        variant: "destructive",
        title: "Invalid Temperature",
        description: "Please enter a valid temperature",
      });
      return;
    }

    const parameters = buildParameterActuals();
    const consumptions = buildMaterialConsumptions();

    await completeMashingStep({
      variables: {
        input: {
          stepExecutionId: step.stepExecutionId,
          actuals: {
            actualTemperature: temperature,
            actualDuration: elapsedTime,
            notes: formData.notes || undefined,
            parameters: parameters.length > 0 ? parameters : undefined,
            materialConsumptions: consumptions.length > 0 ? consumptions : undefined,
          },
        },
      },
    });
  };

  const handlePause = async () => {
    await pauseMashingStep({
      variables: {
        input: {
          stepExecutionId: step.stepExecutionId,
          reason: formData.reason || undefined,
        },
      },
    });
  };

  const handleResume = async () => {
    await resumeMashingStep({
      variables: {
        stepExecutionId: step.stepExecutionId,
      },
    });
  };

  const handleHold = async () => {
    if (!formData.reason.trim()) {
      toast({
        variant: "destructive",
        title: "Reason Required",
        description: "Please enter a reason for holding the step",
      });
      return;
    }

    await holdMashingStep({
      variables: {
        input: {
          stepExecutionId: step.stepExecutionId,
          reason: formData.reason,
        },
      },
    });
  };

  const handleAbort = async () => {
    if (!formData.reason.trim()) {
      toast({
        variant: "destructive",
        title: "Reason Required",
        description: "Please enter a reason for aborting the step",
      });
      return;
    }

    await abortMashingStep({
      variables: {
        input: {
          stepExecutionId: step.stepExecutionId,
          reason: formData.reason,
        },
      },
    });
  };

  const handleClose = () => {
    setFormData({ actualTemperature: "", notes: "", reason: "" });
    setParameterValues({});
    setMaterialConsumptions({});
    onClose();
  };

  // Check for potential temperature deviation
  const temperatureDeviation =
    step.targetTemperature && formData.actualTemperature
      ? Math.abs(
          parseFloat(formData.actualTemperature) - step.targetTemperature
        )
      : 0;
  const hasTemperatureWarning = temperatureDeviation > 5;

  // Check for potential timing deviation
  const timingDeviation =
    step.targetDuration && elapsedTime
      ? Math.abs(elapsedTime - step.targetDuration) / step.targetDuration
      : 0;
  const hasTimingWarning = timingDeviation > 0.1; // 10% threshold

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-lg sm:text-xl">
              {step.stepName}
            </SheetTitle>
            <MashingStepStateBadge state={step.state} size="sm" />
          </div>
          <SheetDescription className="text-sm">
            Step {step.stepIndex + 1} - Mashing Phase
            {(step.displayName || step.stepType) && (
              <Badge variant="outline" className="ml-2">
                {step.displayName || step.stepType}
              </Badge>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 sm:mt-6 space-y-4 sm:space-y-6 pb-4">
          {/* Step Info */}
          <div className="rounded-lg border p-3 sm:p-4 space-y-3">
            {/* Target Temperature */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Thermometer className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Target Temp</span>
              </div>
              <Badge variant="outline" className="text-sm">
                {step.targetTemperature
                  ? `${step.targetTemperature}°F`
                  : "N/A"}
              </Badge>
            </div>

            {/* Target Duration */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Target Duration</span>
              </div>
              <Badge variant="outline" className="text-sm">
                {formatTargetDuration(step.targetDuration)}
              </Badge>
            </div>

            {/* Elapsed Time (if running) */}
            {(step.state === "Running" || step.state === "Paused") && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Elapsed Time</span>
                </div>
                <Badge
                  variant={hasTimingWarning ? "destructive" : "secondary"}
                  className="text-sm font-mono"
                >
                  {formatElapsedTime(elapsedTime)}
                </Badge>
              </div>
            )}
          </div>

          {/* Deviation Warnings */}
          {(hasTemperatureWarning || hasTimingWarning) && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {hasTemperatureWarning && (
                  <div>
                    Temperature deviation: {temperatureDeviation.toFixed(1)}°F
                    from target
                  </div>
                )}
                {hasTimingWarning && (
                  <div>
                    Timing deviation: {(timingDeviation * 100).toFixed(0)}% from
                    target
                  </div>
                )}
                <div className="mt-1 text-xs">
                  Deviations will be logged on completion
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Completion Form (if can complete) */}
          {canCompleteStep(step.state) && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="actualTemperature" className="text-sm">
                  Actual Temperature (°F) *
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="actualTemperature"
                    type="number"
                    step="0.1"
                    placeholder={
                      step.targetTemperature
                        ? `Target: ${step.targetTemperature}`
                        : "Enter temperature"
                    }
                    value={formData.actualTemperature}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        actualTemperature: e.target.value,
                      }))
                    }
                    disabled={isLoading}
                    className="text-sm"
                  />
                  <div className="flex items-center px-3 border rounded-md bg-muted">
                    <span className="text-sm text-muted-foreground">°F</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="text-sm">
                  Notes (optional)
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Add any notes about this step..."
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  disabled={isLoading}
                  className="text-sm min-h-[80px]"
                />
              </div>

              {/* Material Consumption (for grain/additive/liquid steps) */}
              {isMaterialStep && step.linkedBomItems && step.linkedBomItems.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Material Consumption</Label>
                  </div>
                  <div className="rounded-lg border p-3 space-y-3">
                    {step.linkedBomItems.map((bom) => (
                      <div key={bom.id} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{bom.itemName || 'Unknown Item'}</span>
                          <Badge variant="outline">
                            Planned: {bom.quantityPlanned?.toFixed(2)} {bom.units}
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Actual quantity"
                            value={materialConsumptions[bom.id]?.quantityActual !== undefined
                              ? materialConsumptions[bom.id].quantityActual
                              : (bom.quantityPlanned ? Number(bom.quantityPlanned.toFixed(2)) : '')}
                            onChange={(e) =>
                              setMaterialConsumptions((prev) => ({
                                ...prev,
                                [bom.id]: {
                                  ...prev[bom.id],
                                  recipeBomItemId: bom.id,
                                  quantityActual: parseFloat(e.target.value) || 0,
                                },
                              }))
                            }
                            disabled={isLoading}
                            className="text-sm"
                          />
                          <Input
                            type="text"
                            placeholder="Lot #"
                            value={materialConsumptions[bom.id]?.lotNumber ?? ''}
                            onChange={(e) =>
                              setMaterialConsumptions((prev) => ({
                                ...prev,
                                [bom.id]: {
                                  ...prev[bom.id],
                                  recipeBomItemId: bom.id,
                                  lotNumber: e.target.value,
                                },
                              }))
                            }
                            disabled={isLoading}
                            className="text-sm w-32"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dynamic Parameters based on step type */}
              {parameterDefinitions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Step Parameters</Label>
                  </div>
                  <div className="rounded-lg border p-3 space-y-3">
                    {parameterDefinitions.map((def) => (
                      <div key={def.id} className="space-y-2">
                        <Label htmlFor={def.parameterName} className="text-sm flex items-center gap-2">
                          {def.displayName}
                          {def.isRequired && <span className="text-red-500">*</span>}
                          {def.unit && (
                            <Badge variant="secondary" className="text-xs">
                              {def.unit}
                            </Badge>
                          )}
                        </Label>
                        {def.description && (
                          <p className="text-xs text-muted-foreground">{def.description}</p>
                        )}
                        {def.parameterType === 'Boolean' ? (
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={def.parameterName}
                              checked={parameterValues[def.parameterName] === true}
                              onCheckedChange={(checked) =>
                                setParameterValues((prev) => ({
                                  ...prev,
                                  [def.parameterName]: checked,
                                }))
                              }
                              disabled={isLoading}
                            />
                            <label
                              htmlFor={def.parameterName}
                              className="text-sm cursor-pointer"
                            >
                              {def.displayName}
                            </label>
                          </div>
                        ) : def.parameterType === 'Enum' && def.enumValues ? (
                          <Select
                            value={parameterValues[def.parameterName] || ''}
                            onValueChange={(value) =>
                              setParameterValues((prev) => ({
                                ...prev,
                                [def.parameterName]: value,
                              }))
                            }
                            disabled={isLoading}
                          >
                            <SelectTrigger className="text-sm">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {def.enumValues.map((enumVal) => (
                                <SelectItem key={enumVal} value={enumVal}>
                                  {enumVal}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : def.parameterType === 'Text' ? (
                          <Textarea
                            id={def.parameterName}
                            placeholder={`Enter ${def.displayName.toLowerCase()}...`}
                            value={parameterValues[def.parameterName] || ''}
                            onChange={(e) =>
                              setParameterValues((prev) => ({
                                ...prev,
                                [def.parameterName]: e.target.value,
                              }))
                            }
                            disabled={isLoading}
                            className="text-sm min-h-[60px]"
                          />
                        ) : (
                          <div className="flex gap-2">
                            <Input
                              id={def.parameterName}
                              type="number"
                              step={def.parameterType === 'Int' ? '1' : '0.1'}
                              min={def.validationMin}
                              max={def.validationMax}
                              placeholder={
                                def.defaultValue
                                  ? `Default: ${def.defaultValue}`
                                  : `Enter ${def.displayName.toLowerCase()}`
                              }
                              value={parameterValues[def.parameterName] ?? ''}
                              onChange={(e) =>
                                setParameterValues((prev) => ({
                                  ...prev,
                                  [def.parameterName]: e.target.value,
                                }))
                              }
                              disabled={isLoading}
                              className="text-sm"
                            />
                            {def.unit && (
                              <div className="flex items-center px-3 border rounded-md bg-muted">
                                <span className="text-sm text-muted-foreground">{def.unit}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reason Input (for hold/abort) */}
          {(canHoldStep(step.state) || canAbortStep(step.state)) && (
            <div className="space-y-2">
              <Label htmlFor="reason" className="text-sm">
                Reason (required for Hold/Abort)
              </Label>
              <Textarea
                id="reason"
                placeholder="Enter reason for hold or abort..."
                value={formData.reason}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, reason: e.target.value }))
                }
                disabled={isLoading}
                className="text-sm min-h-[60px]"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {/* Complete Button */}
            {canCompleteStep(step.state) && (
              <Button
                onClick={handleComplete}
                disabled={!formData.actualTemperature || isLoading}
                className="w-full"
                variant={hasTemperatureWarning ? "destructive" : "default"}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {isLoading ? "Completing..." : "Complete Step"}
              </Button>
            )}

            {/* Pause/Resume Buttons */}
            {canPauseStep(step.state) && (
              <Button
                onClick={handlePause}
                disabled={isLoading}
                className="w-full"
                variant="secondary"
              >
                <PauseCircle className="h-4 w-4 mr-2" />
                {isLoading ? "Pausing..." : "Pause Step"}
              </Button>
            )}

            {canResumeStep(step.state) && (
              <Button
                onClick={handleResume}
                disabled={isLoading}
                className="w-full"
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                {isLoading ? "Resuming..." : "Resume Step"}
              </Button>
            )}

            {/* Hold Button */}
            {canHoldStep(step.state) && (
              <Button
                onClick={handleHold}
                disabled={!formData.reason.trim() || isLoading}
                className="w-full"
                variant="outline"
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                {isLoading ? "Holding..." : "Hold Step"}
              </Button>
            )}

            {/* Abort Button */}
            {canAbortStep(step.state) && (
              <Button
                onClick={handleAbort}
                disabled={!formData.reason.trim() || isLoading}
                className="w-full"
                variant="destructive"
              >
                <XCircle className="h-4 w-4 mr-2" />
                {isLoading ? "Aborting..." : "Abort Step"}
              </Button>
            )}

            {/* Close Button */}
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              className="w-full"
            >
              Close
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
