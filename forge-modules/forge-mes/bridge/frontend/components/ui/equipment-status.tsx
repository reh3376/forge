'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { 
	Clock, 
	AlertTriangle, 
	XCircle, 
	Wrench,
	Pause,
	Play,
	WifiOff
} from 'lucide-react'

export type EquipmentStatus = 
	| 'running' 
	| 'idle' 
	| 'maintenance' 
	| 'offline' 
	| 'error' 
	| 'setup'
	| 'paused'
	| 'standby'

interface EquipmentStatusProps {
	status: EquipmentStatus
	label?: string
	showIcon?: boolean
	size?: 'sm' | 'md' | 'lg'
	className?: string
}

const statusConfig = {
	running: {
		icon: Play,
		label: 'Running',
		color: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700',
		pulse: true
	},
	idle: {
		icon: Pause,
		label: 'Idle',
		color: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
		pulse: false
	},
	maintenance: {
		icon: Wrench,
		label: 'Maintenance',
		color: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700',
		pulse: false
	},
	offline: {
		icon: WifiOff,
		label: 'Offline',
		color: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-700',
		pulse: false
	},
	error: {
		icon: XCircle,
		label: 'Error',
		color: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
		pulse: true
	},
	setup: {
		icon: AlertTriangle,
		label: 'Setup',
		color: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700',
		pulse: false
	},
	paused: {
		icon: Pause,
		label: 'Paused',
		color: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700',
		pulse: false
	},
	standby: {
		icon: Clock,
		label: 'Standby',
		color: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-700',
		pulse: false
	}
}

export function EquipmentStatus({
	status,
	label,
	showIcon = true,
	size = 'md',
	className
}: EquipmentStatusProps) {
	const config = statusConfig[status]
	const Icon = config.icon
	
	const sizeClasses = {
		sm: 'h-5 text-xs px-2 py-0.5',
		md: 'h-6 text-sm px-2.5 py-1',
		lg: 'h-8 text-base px-3 py-1.5'
	}
	
	const iconSizes = {
		sm: 'h-3 w-3',
		md: 'h-4 w-4',
		lg: 'h-5 w-5'
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
			{label || config.label}
		</Badge>
	)
}

// Comprehensive equipment status indicator with additional info
interface EquipmentStatusCardProps {
	equipmentName: string
	status: EquipmentStatus
	lastUpdate?: Date
	currentOrder?: string
	progress?: number
	className?: string
}

export function EquipmentStatusCard({
	equipmentName,
	status,
	lastUpdate,
	currentOrder,
	progress,
	className
}: EquipmentStatusCardProps) {
	const formatLastUpdate = (date: Date) => {
		const now = new Date()
		const diff = now.getTime() - date.getTime()
		const minutes = Math.floor(diff / 60000)
		
		if (minutes < 1) return 'Just now'
		if (minutes < 60) return `${minutes}m ago`
		
		const hours = Math.floor(minutes / 60)
		if (hours < 24) return `${hours}h ago`
		
		const days = Math.floor(hours / 24)
		return `${days}d ago`
	}

	return (
		<div className={cn(
			'rounded-lg border bg-card text-card-foreground shadow-sm p-4',
			className
		)}>
			<div className="flex items-center justify-between mb-2">
				<h3 className="font-semibold text-sm">{equipmentName}</h3>
				<EquipmentStatus status={status} size="sm" />
			</div>
			
			{currentOrder && (
				<div className="text-xs text-muted-foreground mb-1">
					Order: {currentOrder}
				</div>
			)}
			
			{progress !== undefined && status === 'running' && (
				<div className="mb-2">
					<div className="flex justify-between text-xs text-muted-foreground mb-1">
						<span>Progress</span>
						<span>{Math.round(progress)}%</span>
					</div>
					<div className="w-full bg-muted rounded-full h-2">
						<div 
							className="bg-primary h-2 rounded-full transition-all duration-300" 
							style={{ width: `${progress}%` }}
						/>
					</div>
				</div>
			)}
			
			{lastUpdate && (
				<div className="text-xs text-muted-foreground">
					Updated {formatLastUpdate(lastUpdate)}
				</div>
			)}
		</div>
	)
}

// Quick status indicator for dense layouts
export function StatusDot({ 
	status, 
	size = 'md',
	className 
}: { 
	status: EquipmentStatus
	size?: 'sm' | 'md' | 'lg'
	className?: string 
}) {
	const config = statusConfig[status]
	
	const sizeClasses = {
		sm: 'h-2 w-2',
		md: 'h-3 w-3',
		lg: 'h-4 w-4'
	}
	
	const colorClasses = {
		running: 'bg-green-500',
		idle: 'bg-blue-500',
		maintenance: 'bg-orange-500',
		offline: 'bg-gray-500',
		error: 'bg-red-500',
		setup: 'bg-yellow-500',
		paused: 'bg-purple-500',
		standby: 'bg-slate-500'
	}

	return (
		<div 
			className={cn(
				'rounded-full',
				sizeClasses[size],
				colorClasses[status],
				config.pulse && 'animate-pulse',
				className
			)}
			title={config.label}
		/>
	)
}

// Equipment status legend for dashboards
export function EquipmentStatusLegend({ className }: { className?: string }) {
	return (
		<div className={cn('flex flex-wrap gap-2', className)}>
			{Object.entries(statusConfig).map(([status, config]) => (
				<div key={status} className="flex items-center gap-1.5">
					<StatusDot status={status as EquipmentStatus} size="sm" />
					<span className="text-xs text-muted-foreground">{config.label}</span>
				</div>
			))}
		</div>
	)
} 