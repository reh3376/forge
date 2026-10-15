'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  CircleCheck,
  Clock,
  Activity,
  Droplets,
  Wrench,
  XCircle,
  RefreshCw,
} from 'lucide-react'
import { EquipmentOperationalState } from '@/lib/api/equipment-state-api'

const stateConfig: Record<
  EquipmentOperationalState,
  {
    icon: React.ComponentType<{ className?: string }>
    label: string
    color: string
    dotColor: string
  }
> = {
  [EquipmentOperationalState.Available]: {
    icon: CircleCheck,
    label: 'Available',
    color:
      'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700',
    dotColor: 'bg-green-500',
  },
  [EquipmentOperationalState.Allocated]: {
    icon: Clock,
    label: 'Allocated',
    color:
      'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700',
    dotColor: 'bg-amber-500',
  },
  [EquipmentOperationalState.InUse]: {
    icon: Activity,
    label: 'In Use',
    color:
      'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
    dotColor: 'bg-blue-500',
  },
  [EquipmentOperationalState.Changeover]: {
    icon: RefreshCw,
    label: 'Changeover',
    color:
      'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700',
    dotColor: 'bg-purple-500',
  },
  [EquipmentOperationalState.InCIP]: {
    icon: Droplets,
    label: 'In CIP',
    color:
      'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-700',
    dotColor: 'bg-cyan-500',
  },
  [EquipmentOperationalState.InMaintenance]: {
    icon: Wrench,
    label: 'Maintenance',
    color:
      'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700',
    dotColor: 'bg-orange-500',
  },
  [EquipmentOperationalState.OutOfService]: {
    icon: XCircle,
    label: 'Out of Service',
    color:
      'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
    dotColor: 'bg-red-500',
  },
}

interface EquipmentStateBadgeProps {
  state: EquipmentOperationalState
  showIcon?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function EquipmentStateBadge({
  state,
  showIcon = true,
  size = 'md',
  className,
}: EquipmentStateBadgeProps) {
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
        'font-medium border inline-flex items-center gap-1.5',
        className
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {config.label}
    </Badge>
  )
}

export function EquipmentStateDot({
  state,
  size = 'md',
  className,
}: {
  state: EquipmentOperationalState
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

  return (
    <div
      className={cn('rounded-full', sizeClasses[size], config.dotColor, className)}
      title={config.label}
    />
  )
}

export { stateConfig as equipmentStateConfig }
