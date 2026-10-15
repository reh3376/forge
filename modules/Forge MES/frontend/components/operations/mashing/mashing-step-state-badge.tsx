"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  CheckCircle,
  Pause,
  AlertTriangle,
  XCircle,
  Clock,
  RotateCcw,
  StopCircle,
} from "lucide-react";
import type { S88StepState } from "@/lib/api/graphql/mashing-execution";

interface MashingStepStateBadgeProps {
  state: S88StepState;
  label?: string;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * S88 Step State Badge Configuration
 * Based on ISA-88 procedural states
 */
const stateConfig: Record<
  S88StepState,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    color: string;
    pulse: boolean;
  }
> = {
  Idle: {
    icon: Clock,
    label: "Idle",
    color:
      "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-700",
    pulse: false,
  },
  Running: {
    icon: Play,
    label: "Running",
    color:
      "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700",
    pulse: true,
  },
  Complete: {
    icon: CheckCircle,
    label: "Complete",
    color:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700",
    pulse: false,
  },
  Paused: {
    icon: Pause,
    label: "Paused",
    color:
      "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700",
    pulse: false,
  },
  Held: {
    icon: AlertTriangle,
    label: "Held",
    color:
      "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700",
    pulse: true,
  },
  Stopping: {
    icon: StopCircle,
    label: "Stopping",
    color:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700",
    pulse: true,
  },
  Stopped: {
    icon: StopCircle,
    label: "Stopped",
    color:
      "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-700",
    pulse: false,
  },
  Aborting: {
    icon: XCircle,
    label: "Aborting",
    color:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700",
    pulse: true,
  },
  Aborted: {
    icon: XCircle,
    label: "Aborted",
    color:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700",
    pulse: false,
  },
  Restarting: {
    icon: RotateCcw,
    label: "Restarting",
    color:
      "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700",
    pulse: true,
  },
};

export function MashingStepStateBadge({
  state,
  label,
  showIcon = true,
  size = "md",
  className,
}: MashingStepStateBadgeProps) {
  const config = stateConfig[state];
  const Icon = config.icon;

  const sizeClasses = {
    sm: "h-5 text-xs px-2 py-0.5",
    md: "h-6 text-sm px-2.5 py-1",
    lg: "h-8 text-base px-3 py-1.5",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <Badge
      variant="secondary"
      className={cn(
        config.color,
        sizeClasses[size],
        config.pulse && "animate-pulse",
        "font-medium border inline-flex items-center gap-1.5",
        className
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {label || config.label}
    </Badge>
  );
}

/**
 * Quick status dot indicator for dense layouts
 */
export function StepStateDot({
  state,
  size = "md",
  className,
}: {
  state: S88StepState;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const config = stateConfig[state];

  const sizeClasses = {
    sm: "h-2 w-2",
    md: "h-3 w-3",
    lg: "h-4 w-4",
  };

  const colorClasses: Record<S88StepState, string> = {
    Idle: "bg-gray-500",
    Running: "bg-green-500",
    Complete: "bg-blue-500",
    Paused: "bg-yellow-500",
    Held: "bg-orange-500",
    Stopping: "bg-amber-500",
    Stopped: "bg-slate-500",
    Aborting: "bg-red-500",
    Aborted: "bg-red-500",
    Restarting: "bg-purple-500",
  };

  return (
    <div
      className={cn(
        "rounded-full",
        sizeClasses[size],
        colorClasses[state],
        config.pulse && "animate-pulse",
        className
      )}
      title={config.label}
    />
  );
}

/**
 * Status legend for SFC displays
 */
export function StepStateLegend({ className }: { className?: string }) {
  const displayStates: S88StepState[] = [
    "Idle",
    "Running",
    "Complete",
    "Paused",
    "Held",
    "Aborted",
  ];

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {displayStates.map((state) => (
        <div key={state} className="flex items-center gap-1.5">
          <StepStateDot state={state} size="sm" />
          <span className="text-xs text-muted-foreground">
            {stateConfig[state].label}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Helper to check if a state is terminal (cannot transition further)
 */
export function isTerminalState(state: S88StepState): boolean {
  return ["Complete", "Stopped", "Aborted"].includes(state);
}

/**
 * Helper to check if a state can be started
 */
export function canStartStep(state: S88StepState): boolean {
  return state === "Idle";
}

/**
 * Helper to check if a step can be completed
 */
export function canCompleteStep(state: S88StepState): boolean {
  return state === "Running";
}

/**
 * Helper to check if a step can be paused
 */
export function canPauseStep(state: S88StepState): boolean {
  return state === "Running";
}

/**
 * Helper to check if a step can be resumed
 */
export function canResumeStep(state: S88StepState): boolean {
  return state === "Paused";
}

/**
 * Helper to check if a step can be held
 */
export function canHoldStep(state: S88StepState): boolean {
  return state === "Running";
}

/**
 * Helper to check if a step can be aborted
 */
export function canAbortStep(state: S88StepState): boolean {
  return ["Running", "Paused", "Held"].includes(state);
}
