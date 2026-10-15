'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Play,
  CheckCircle,
  CheckCircle2,
  Clock,
  Droplets,
  Download,
  FileCheck,
  Rocket,
  AlertTriangle,
} from 'lucide-react'
import { ChangeoverState } from '@/lib/api/changeover-api'

interface ChangeoverStateBadgeProps {
  state: ChangeoverState
  showIcon?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const stateConfig: Record<
  ChangeoverState,
  {
    icon: React.ComponentType<{ className?: string }>
    label: string
    color: string
    pulse: boolean
  }
> = {
  [ChangeoverState.PRODUCTION]: {
    icon: Play,
    label: 'Production',
    color:
      'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700',
    pulse: false,
  },
  [ChangeoverState.COOK_COMPLETE]: {
    icon: CheckCircle,
    label: 'Cook Complete',
    color:
      'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-700',
    pulse: false,
  },
  [ChangeoverState.AWAITING_CHANGEOVER]: {
    icon: Clock,
    label: 'Awaiting Changeover',
    color:
      'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700',
    pulse: true,
  },
  [ChangeoverState.CIP_IN_PROGRESS]: {
    icon: Droplets,
    label: 'CIP In Progress',
    color:
      'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
    pulse: true,
  },
  [ChangeoverState.CIP_COMPLETE]: {
    icon: CheckCircle2,
    label: 'CIP Complete',
    color:
      'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
    pulse: false,
  },
  [ChangeoverState.RECIPE_LOADING]: {
    icon: Download,
    label: 'Recipe Loading',
    color:
      'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700',
    pulse: true,
  },
  [ChangeoverState.RECIPE_LOADED]: {
    icon: FileCheck,
    label: 'Recipe Loaded',
    color:
      'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700',
    pulse: false,
  },
  [ChangeoverState.READY_TO_START]: {
    icon: Rocket,
    label: 'Ready to Start',
    color:
      'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700',
    pulse: true,
  },
  [ChangeoverState.ERROR]: {
    icon: AlertTriangle,
    label: 'Error',
    color:
      'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
    pulse: true,
  },
}

export function ChangeoverStateBadge({
  state,
  showIcon = true,
  size = 'md',
  className,
}: ChangeoverStateBadgeProps) {
  const config = stateConfig[state]
  if (!config) return null
  const Icon = config.icon

  const sizeClasses = {
    sm: 'h-5 text-xs px-2 py-0.5',
    md: 'h-6 text-sm px-2.5 py-1',
    lg: 'h-8 text-base px-3 py-1.5',
  }

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  }

  return (
    <Badge
      variant="secondary"
      className={cn(
        config.color,
        sizeClasses[size],
        config.pulse && 'animate-pulse',
        'font-medium border inline-flex items-center gap-1.5',
        className
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {config.label}
    </Badge>
  )
}

export function ChangeoverStateDot({
  state,
  size = 'md',
  className,
}: {
  state: ChangeoverState
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const config = stateConfig[state]
  if (!config) return null

  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  }

  const colorClasses: Record<ChangeoverState, string> = {
    [ChangeoverState.PRODUCTION]: 'bg-green-500',
    [ChangeoverState.COOK_COMPLETE]: 'bg-teal-500',
    [ChangeoverState.AWAITING_CHANGEOVER]: 'bg-orange-500',
    [ChangeoverState.CIP_IN_PROGRESS]: 'bg-blue-500',
    [ChangeoverState.CIP_COMPLETE]: 'bg-blue-500',
    [ChangeoverState.RECIPE_LOADING]: 'bg-purple-500',
    [ChangeoverState.RECIPE_LOADED]: 'bg-purple-500',
    [ChangeoverState.READY_TO_START]: 'bg-emerald-500',
    [ChangeoverState.ERROR]: 'bg-red-500',
  }

  return (
    <div
      className={cn(
        'rounded-full',
        sizeClasses[size],
        colorClasses[state],
        config.pulse && 'animate-pulse',
        className
      )}
      title={config.label}
    />
  )
}
