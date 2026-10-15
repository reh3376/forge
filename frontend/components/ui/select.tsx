"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

// Manufacturing-specific Select Components

// Customer Select Component
interface CustomerSelectProps {
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function CustomerSelect({ 
  value, 
  onValueChange, 
  placeholder = "Select customer",
  className 
}: CustomerSelectProps) {
  const customers = [
    { value: 'BHK', label: 'BHK - Bourbon Heritage Kentucky' },
    { value: 'PAW', label: 'PAW - Premium American Whiskey' },
    { value: 'HNW', label: 'HNW - Heritage North Whiskey' },
    { value: 'ABT', label: 'ABT - Artisan Bourbon Trading' },
    { value: 'WHK', label: 'WHK - Whiskey House Kentucky' },
    { value: 'DST', label: 'DST - Distillery Solutions Trading' }
  ]

  return (
    <Select value={value || ''} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {customers.map((customer) => (
          <SelectItem key={customer.value} value={customer.value}>
            {customer.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// Status Select Component
interface StatusSelectProps {
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
  type?: 'production' | 'order' | 'equipment'
}

export function StatusSelect({ 
  value, 
  onValueChange, 
  placeholder = "Select status",
  className,
  type = 'production'
}: StatusSelectProps) {
  const statusOptions = {
    production: [
      { value: 'initiated', label: 'Initiated' },
      { value: 'in-progress', label: 'In Progress' },
      { value: 'completed', label: 'Completed' },
      { value: 'on-hold', label: 'On Hold' },
      { value: 'cancelled', label: 'Cancelled' }
    ],
    order: [
      { value: 'scheduled', label: 'Scheduled' },
      { value: 'running', label: 'Running' },
      { value: 'completed', label: 'Completed' },
      { value: 'delayed', label: 'Delayed' },
      { value: 'cancelled', label: 'Cancelled' }
    ],
    equipment: [
      { value: 'running', label: 'Running' },
      { value: 'idle', label: 'Idle' },
      { value: 'maintenance', label: 'Maintenance' },
      { value: 'offline', label: 'Offline' },
      { value: 'error', label: 'Error' },
      { value: 'setup', label: 'Setup' }
    ]
  }

  const options = statusOptions[type]

  return (
    <Select value={value || ''} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// Container Type Select Component
interface ContainerTypeSelectProps {
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function ContainerTypeSelect({ 
  value, 
  onValueChange, 
  placeholder = "Select container type",
  className 
}: ContainerTypeSelectProps) {
  const containerTypes = [
    { value: 'barrel-53gal', label: '53 Gallon Barrel' },
    { value: 'barrel-30gal', label: '30 Gallon Barrel' },
    { value: 'barrel-15gal', label: '15 Gallon Barrel' },
    { value: 'tank-500gal', label: '500 Gallon Tank' },
    { value: 'tank-1000gal', label: '1000 Gallon Tank' },
    { value: 'tote-275gal', label: '275 Gallon Tote' },
    { value: 'drum-55gal', label: '55 Gallon Drum' }
  ]

  return (
    <Select value={value || ''} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {containerTypes.map((type) => (
          <SelectItem key={type.value} value={type.value}>
            {type.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// Units Select Component
interface UnitsSelectProps {
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
  type?: 'volume' | 'weight' | 'temperature' | 'time' | 'enzyme' | 'grain' | 'yeast'
}

export function UnitsSelect({
  value,
  onValueChange,
  placeholder = "Select units",
  className,
  type = 'volume'
}: UnitsSelectProps) {
  const unitOptions = {
    volume: [
      { value: 'gal', label: 'Gallons' },
      { value: 'pg', label: 'Proof Gallons' },
      { value: 'bbls', label: 'Barrels' },
      { value: 'l', label: 'Liters' },
      { value: 'ml', label: 'Milliliters' }
    ],
    weight: [
      { value: 'lbs', label: 'Pounds' },
      { value: 'kg', label: 'Kilograms' },
      { value: 'oz', label: 'Ounces' },
      { value: 'g', label: 'Grams' },
      { value: 'tons', label: 'Tons' }
    ],
    temperature: [
      { value: 'f', label: 'Fahrenheit (°F)' },
      { value: 'c', label: 'Celsius (°C)' },
      { value: 'k', label: 'Kelvin (K)' }
    ],
    time: [
      { value: 'min', label: 'Minutes' },
      { value: 'hrs', label: 'Hours' },
      { value: 'days', label: 'Days' },
      { value: 'weeks', label: 'Weeks' },
      { value: 'months', label: 'Months' }
    ],
    enzyme: [
      { value: 'Lbs/Cook', label: 'Pounds per Cook' },
      { value: 'lbs/TotalGrainLoad', label: 'Pound Per Total Grain Load' }
    ],
    grain: [
      { value: '%', label: 'Percent (%)' }
    ],
    yeast: [
      { value: 'Kg/Fermenter', label: 'Kilograms per Fermenter' }
    ]
  }

  const options = unitOptions[type]

  return (
    <Select value={value || ''} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
