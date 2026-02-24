'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
	value?: number
	onChange?: (value: number | undefined) => void
	min?: number
	max?: number
	step?: number
	precision?: number
	unit?: string
	formatType?: 'decimal' | 'integer' | 'currency' | 'percentage'
	allowNegative?: boolean
	placeholder?: string
	className?: string
	disabled?: boolean
}

export function NumericInput({
	value,
	onChange,
	min,
	max,
	precision = 2,
	unit,
	formatType = 'decimal',
	allowNegative = false,
	placeholder,
	className,
	disabled,
	...props
}: NumericInputProps) {
	const [displayValue, setDisplayValue] = React.useState('')
	const [isFocused, setIsFocused] = React.useState(false)

	// Format number for display
	const formatNumber = React.useCallback((num: number): string => {
		if (isNaN(num)) return ''

		switch (formatType) {
			case 'integer':
				return Math.round(num).toString()
			case 'currency':
				return new Intl.NumberFormat('en-US', {
					style: 'currency',
					currency: 'USD',
					minimumFractionDigits: precision,
					maximumFractionDigits: precision,
				}).format(num)
			case 'percentage':
				return `${num.toFixed(precision)}%`
			case 'decimal':
			default:
				return num.toFixed(precision)
		}
	}, [formatType, precision])

	// Parse string to number
	const parseNumber = React.useCallback((str: string): number | undefined => {
		if (!str || str.trim() === '') return undefined
		
		// Remove currency symbols, commas, and other formatting
		const cleanStr = str.replace(/[^0-9.-]/g, '')
		const num = parseFloat(cleanStr)
		
		if (isNaN(num)) return undefined
		
		// Apply constraints
		if (!allowNegative && num < 0) return Math.abs(num)
		if (min !== undefined && num < min) return min
		if (max !== undefined && num > max) return max
		
		return num
	}, [allowNegative, min, max])

	// Update display value when value prop changes
	React.useEffect(() => {
		if (value !== undefined && !isFocused) {
			setDisplayValue(formatNumber(value))
		} else if (value === undefined && !isFocused) {
			setDisplayValue('')
		}
	}, [value, formatNumber, isFocused])

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const inputValue = e.target.value
		setDisplayValue(inputValue)

		const numericValue = parseNumber(inputValue)
		onChange?.(numericValue)
	}

	const handleFocus = () => {
		setIsFocused(true)
		// Show raw number when focused for easier editing
		if (value !== undefined) {
			setDisplayValue(value.toString())
		}
	}

	const handleBlur = () => {
		setIsFocused(false)
		// Format number when focus is lost
		if (value !== undefined) {
			setDisplayValue(formatNumber(value))
		}
	}

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		// Allow: backspace, delete, tab, escape, enter
		if ([8, 9, 27, 13, 46].indexOf(e.keyCode) !== -1 ||
			// Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
			(e.keyCode === 65 && e.ctrlKey) ||
			(e.keyCode === 67 && e.ctrlKey) ||
			(e.keyCode === 86 && e.ctrlKey) ||
			(e.keyCode === 88 && e.ctrlKey) ||
			// Allow: home, end, left, right
			(e.keyCode >= 35 && e.keyCode <= 39)) {
			return
		}
		// Ensure that it is a number and stop the keypress
		if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
			// Allow decimal point
			if (e.keyCode === 190 || e.keyCode === 110) {
				// Only allow one decimal point
				if (displayValue.includes('.')) {
					e.preventDefault()
				}
				return
			}
			// Allow minus sign at the beginning if negative numbers are allowed
			if (allowNegative && e.keyCode === 189 && displayValue.length === 0) {
				return
			}
			e.preventDefault()
		}
	}

	return (
		<div className="relative">
			<Input
				{...props}
				type="text"
				value={displayValue}
				onChange={handleInputChange}
				onFocus={handleFocus}
				onBlur={handleBlur}
				onKeyDown={handleKeyDown}
				placeholder={placeholder}
				className={cn(unit && 'pr-12', className)}
				disabled={disabled}
			/>
			{unit && (
				<div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
					<span className="text-muted-foreground text-sm">{unit}</span>
				</div>
			)}
		</div>
	)
}

// Specialized components for common manufacturing values
export const ProofGallonsInput = (props: Omit<NumericInputProps, 'unit' | 'formatType' | 'precision'>) => (
	<NumericInput
		{...props}
		unit="PG"
		formatType="decimal"
		precision={2}
		min={0}
		placeholder="0.00"
	/>
)

export const BarrelQuantityInput = (props: Omit<NumericInputProps, 'unit' | 'formatType' | 'precision'>) => (
	<NumericInput
		{...props}
		unit="bbls"
		formatType="decimal"
		precision={1}
		min={0}
		placeholder="0.0"
	/>
)

export const DurationInput = (props: Omit<NumericInputProps, 'unit' | 'formatType' | 'precision'> & { unit?: 'hours' | 'days' | 'minutes' }) => (
	<NumericInput
		{...props}
		unit={props.unit || 'hours'}
		formatType="decimal"
		precision={1}
		min={0}
		placeholder="0.0"
	/>
)

export const TemperatureInput = (props: Omit<NumericInputProps, 'unit' | 'formatType' | 'precision'>) => (
	<NumericInput
		{...props}
		unit="°F"
		formatType="integer"
		min={32}
		max={212}
		placeholder="72"
	/>
)

export const PercentageInput = (props: Omit<NumericInputProps, 'unit' | 'formatType' | 'precision' | 'max' | 'min'>) => (
	<NumericInput
		{...props}
		unit="%"
		formatType="decimal"
		precision={2}
		min={0}
		max={100}
		placeholder="0.00"
	/>
) 