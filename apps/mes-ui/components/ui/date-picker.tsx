'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'

interface DatePickerProps {
	date?: Date
	onDateChange?: (date: Date | undefined) => void
	placeholder?: string
	className?: string
	includeTime?: boolean
	disabled?: boolean
}

export function DatePicker({
	date,
	onDateChange,
	placeholder = 'Pick a date',
	className,
	includeTime = false,
	disabled = false,
}: DatePickerProps) {
	const [open, setOpen] = React.useState(false)
	const [timeValue, setTimeValue] = React.useState('')

	React.useEffect(() => {
		if (date && includeTime) {
			setTimeValue(format(date, 'HH:mm'))
		}
	}, [date, includeTime])

	const handleDateSelect = (selectedDate: Date | undefined) => {
		if (!selectedDate) {
			onDateChange?.(undefined)
			return
		}

		if (includeTime && timeValue) {
			const [hoursStr, minutesStr] = timeValue.split(':')
			const hours = parseInt(hoursStr || '0', 10)
			const minutes = parseInt(minutesStr || '0', 10)
			const newDate = new Date(selectedDate)
			newDate.setHours(hours, minutes)
			onDateChange?.(newDate)
		} else {
			onDateChange?.(selectedDate)
		}
	}

	const handleTimeChange = (time: string) => {
		setTimeValue(time)
		if (date) {
			const [hoursStr, minutesStr] = time.split(':')
			const hours = parseInt(hoursStr || '0', 10)
			const minutes = parseInt(minutesStr || '0', 10)
			const newDate = new Date(date)
			newDate.setHours(hours, minutes)
			onDateChange?.(newDate)
		}
	}

	const formatDisplayDate = () => {
		if (!date) return placeholder
		
		if (includeTime) {
			return format(date, 'MMM dd, yyyy h:mm a')
		}
		return format(date, 'MMM dd, yyyy')
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					className={cn(
						'w-full justify-start text-left font-normal',
						!date && 'text-muted-foreground',
						className
					)}
					disabled={disabled}
				>
					<CalendarIcon className="mr-2 h-4 w-4" />
					{formatDisplayDate()}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={date}
					onSelect={handleDateSelect}
					initialFocus
					disabled={disabled}
				/>
				{includeTime && (
					<div className="p-3 border-t">
						<div className="flex items-center space-x-2">
							<label className="text-sm font-medium">Time:</label>
							<Input
								type="time"
								value={timeValue}
								onChange={(e) => handleTimeChange(e.target.value)}
								className="w-24"
							/>
						</div>
					</div>
				)}
			</PopoverContent>
		</Popover>
	)
}

// Note: DateRangePicker can be added later with proper type handling 