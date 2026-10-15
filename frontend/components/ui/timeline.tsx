'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { format, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns'

// Types for Timeline components
export interface ProductionOrder {
	id: string
	title: string
	startDate: Date
	endDate: Date
	status: 'scheduled' | 'running' | 'completed' | 'delayed'
	customer?: string
	recipe?: string
	equipment: string
}

export interface ProductionLine {
	id: string
	name: string
	label: string
	orders: ProductionOrder[]
}

interface TimelineProps {
	productionLines: ProductionLine[]
	startDate?: Date
	endDate?: Date
	currentTime?: Date
	onOrderClick?: (order: ProductionOrder) => void
	className?: string
}

interface TimelineHeaderProps {
	startDate: Date
	endDate: Date
	className?: string
}

interface OrderBarProps {
	order: ProductionOrder
	timelineStart: Date
	timelineEnd: Date
	onOrderClick?: (order: ProductionOrder) => void
	className?: string
}

// Timeline Header Component
export function TimelineHeader({ startDate, endDate, className }: TimelineHeaderProps) {
	const days = eachDayOfInterval({ start: startDate, end: endDate })
	
	return (
		<div className={cn('flex border-b bg-muted/30', className)}>
			{/* Equipment column header */}
			<div className="w-48 p-3 border-r bg-background font-medium text-sm">
				Equipment
			</div>
			{/* Date columns */}
			<div className="flex flex-1">
				{days.map((day) => (
					<div 
						key={day.toISOString()} 
						className="flex-1 min-w-24 p-2 border-r text-center text-xs font-medium"
					>
						<div className="text-muted-foreground">
							{format(day, 'MMM dd')}
						</div>
						<div className="text-lg font-semibold">
							{format(day, 'dd')}
						</div>
						<div className="text-muted-foreground">
							{format(day, 'EEE')}
						</div>
					</div>
				))}
			</div>
		</div>
	)
}

// Current Time Indicator Component
export function CurrentTimeIndicator({ 
	currentTime, 
	timelineStart, 
	timelineEnd 
}: { 
	currentTime: Date
	timelineStart: Date
	timelineEnd: Date 
}) {
	const totalDuration = timelineEnd.getTime() - timelineStart.getTime()
	const currentPosition = currentTime.getTime() - timelineStart.getTime()
	const leftPercentage = (currentPosition / totalDuration) * 100
	
	// Only show if current time is within the timeline range
	if (currentPosition < 0 || currentPosition > totalDuration) {
		return null
	}
	
	return (
		<div 
			className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-10 pointer-events-none"
			style={{ left: `calc(12rem + ${leftPercentage}%)` }}
		>
			<div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-500 rounded-full" />
		</div>
	)
}

// Order Bar Component
export function OrderBar({ 
	order, 
	timelineStart, 
	timelineEnd, 
	onOrderClick,
	className 
}: OrderBarProps) {
	const totalDuration = timelineEnd.getTime() - timelineStart.getTime()
	const orderStart = Math.max(order.startDate.getTime(), timelineStart.getTime())
	const orderEnd = Math.min(order.endDate.getTime(), timelineEnd.getTime())
	
	const leftPercentage = ((orderStart - timelineStart.getTime()) / totalDuration) * 100
	const widthPercentage = ((orderEnd - orderStart) / totalDuration) * 100
	
	// Don't render if order is completely outside timeline
	if (order.endDate < timelineStart || order.startDate > timelineEnd || widthPercentage <= 0) {
		return null
	}
	
	const statusColors = {
		scheduled: 'bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200',
		running: 'bg-green-100 border-green-300 text-green-800 hover:bg-green-200',
		completed: 'bg-gray-100 border-gray-300 text-gray-800 hover:bg-gray-200',
		delayed: 'bg-red-100 border-red-300 text-red-800 hover:bg-red-200'
	}
	
	return (
		<div
			className={cn(
				'absolute h-8 rounded border-2 cursor-pointer transition-colors flex items-center px-2 text-xs font-medium shadow-sm',
				statusColors[order.status],
				className
			)}
			style={{
				left: `${leftPercentage}%`,
				width: `${widthPercentage}%`,
				minWidth: '60px'
			}}
			onClick={() => onOrderClick?.(order)}
			title={`${order.title}\nStart: ${format(order.startDate, 'MMM dd, h:mm a')}\nEnd: ${format(order.endDate, 'MMM dd, h:mm a')}\nStatus: ${order.status}`}
		>
			<span className="truncate">{order.title}</span>
		</div>
	)
}

// Production Line Row Component
export function ProductionLineRow({ 
	line, 
	timelineStart, 
	timelineEnd, 
	onOrderClick 
}: { 
	line: ProductionLine
	timelineStart: Date
	timelineEnd: Date
	onOrderClick?: (order: ProductionOrder) => void 
}) {
	return (
		<div className="flex border-b min-h-16 hover:bg-muted/20">
			{/* Equipment label */}
			<div className="w-48 p-3 border-r bg-background flex items-center">
				<div>
					<div className="font-medium text-sm">{line.label}</div>
					<div className="text-xs text-muted-foreground">{line.name}</div>
				</div>
			</div>
			
			{/* Timeline area */}
			<div className="flex-1 relative p-2">
				{line.orders.map((order) => (
					<OrderBar
						key={order.id}
						order={order}
						timelineStart={timelineStart}
						timelineEnd={timelineEnd}
						{...(onOrderClick && { onOrderClick })}
					/>
				))}
			</div>
		</div>
	)
}

// Main Timeline Component
export function Timeline({ 
	productionLines, 
	startDate, 
	endDate, 
	currentTime,
	onOrderClick,
	className 
}: TimelineProps) {
	const timelineStart = startDate || startOfWeek(new Date())
	const timelineEnd = endDate || endOfWeek(new Date())
	const now = currentTime || new Date()
	
	return (
		<div className={cn('border rounded-lg bg-background overflow-hidden', className)}>
			<TimelineHeader startDate={timelineStart} endDate={timelineEnd} />
			
			<div className="relative max-h-96 overflow-y-auto">
				{/* Current time indicator */}
				<CurrentTimeIndicator 
					currentTime={now}
					timelineStart={timelineStart}
					timelineEnd={timelineEnd}
				/>
				
				{/* Production lines */}
				{productionLines.map((line) => (
					<ProductionLineRow
						key={line.id}
						line={line}
						timelineStart={timelineStart}
						timelineEnd={timelineEnd}
						{...(onOrderClick && { onOrderClick })}
					/>
				))}
			</div>
		</div>
	)
}

// Timeline Controls Component
export function TimelineControls({
	currentRange,
	onRangeChange,
	onTodayClick,
	className
}: {
	currentRange: { start: Date; end: Date }
	onRangeChange: (range: { start: Date; end: Date }) => void
	onTodayClick: () => void
	className?: string
}) {
	const goToPreviousWeek = () => {
		const newStart = new Date(currentRange.start)
		newStart.setDate(newStart.getDate() - 7)
		const newEnd = new Date(currentRange.end)
		newEnd.setDate(newEnd.getDate() - 7)
		onRangeChange({ start: newStart, end: newEnd })
	}
	
	const goToNextWeek = () => {
		const newStart = new Date(currentRange.start)
		newStart.setDate(newStart.getDate() + 7)
		const newEnd = new Date(currentRange.end)
		newEnd.setDate(newEnd.getDate() + 7)
		onRangeChange({ start: newStart, end: newEnd })
	}
	
	return (
		<div className={cn('flex items-center gap-2 mb-4', className)}>
			<button
				onClick={goToPreviousWeek}
				className="px-3 py-1 bg-secondary hover:bg-secondary/80 rounded text-sm"
			>
				← Previous Week
			</button>
			<button
				onClick={onTodayClick}
				className="px-3 py-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded text-sm"
			>
				Today
			</button>
			<button
				onClick={goToNextWeek}
				className="px-3 py-1 bg-secondary hover:bg-secondary/80 rounded text-sm"
			>
				Next Week →
			</button>
			<div className="ml-4 text-sm text-muted-foreground">
				{format(currentRange.start, 'MMM dd')} - {format(currentRange.end, 'MMM dd, yyyy')}
			</div>
		</div>
	)
} 