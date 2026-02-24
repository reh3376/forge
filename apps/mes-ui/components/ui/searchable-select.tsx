"use client"

import React, { useState, useMemo } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export interface SearchableSelectOption {
  value: string
  label: string
  description?: string
  category?: string | undefined
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value?: string | undefined
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  className?: string | undefined
  loading?: boolean
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search options...",
  emptyMessage = "No options found.",
  disabled = false,
  className,
  loading = false
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")

  // Ensure unique options by value to prevent duplicate keys
  const uniqueOptions = useMemo(() => {
    const seen = new Set<string>()
    return options.filter(option => {
      if (!option.value || seen.has(option.value)) {
        return false
      }
      seen.add(option.value)
      return true
    })
  }, [options])

  // Filter options based on search
  const filteredOptions = useMemo(() => {
    if (!searchValue) return uniqueOptions
    
    const searchLower = searchValue.toLowerCase()
    return uniqueOptions.filter(option => 
      option.label.toLowerCase().includes(searchLower) ||
      option.value.toLowerCase().includes(searchLower) ||
      option.description?.toLowerCase().includes(searchLower) ||
      option.category?.toLowerCase().includes(searchLower)
    )
  }, [uniqueOptions, searchValue])

  // Find selected option
  const selectedOption = uniqueOptions.find(option => option.value === value)

  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue === value ? "" : selectedValue)
    setOpen(false)
    setSearchValue("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled || loading}
        >
          {loading ? (
            "Loading..."
          ) : selectedOption ? (
            <span className="truncate">
              {selectedOption.value} - {selectedOption.label}
            </span>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[400px] p-0" 
        align="start"
        side="bottom"
        sideOffset={4}
        avoidCollisions={true}
        collisionPadding={8}
        sticky="always"
      >
        <div className="flex flex-col">
          {/* Search Input */}
          <div className="flex items-center border-b px-3 py-2 sticky top-0 bg-background z-10">
            <Input
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          
          {/* Options List - Fixed height with proper scrolling */}
          <div 
            className="max-h-[300px] overflow-y-auto overscroll-contain"
            role="listbox"
            aria-label="Options"
          >
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              <div className="p-1">
                {filteredOptions.map((option) => {
                  const isSelected = value === option.value
                  return (
                    <div
                      key={option.value}
                      className={cn(
                        "relative flex cursor-pointer select-none items-start rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                        isSelected && "bg-accent text-accent-foreground"
                      )}
                      onClick={() => handleSelect(option.value)}
                      role="option"
                    >
                      <div className="flex items-center gap-2 w-full">
                        <Check
                          className={cn(
                            "h-4 w-4 mt-0.5 flex-shrink-0",
                            isSelected ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-1 py-0.5 rounded flex-shrink-0">
                              {option.value}
                            </code>
                            <span className="font-medium truncate">
                              {option.label}
                            </span>
                          </div>
                          {option.description && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {option.description}
                            </div>
                          )}
                          {option.category && (
                            <div className="text-xs text-muted-foreground">
                              Category: {option.category}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Customer-specific searchable select
interface CustomerSearchableSelectProps {
  customers: Array<{ id: string; name: string; customerCode: string }>
  value?: string | undefined
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  loading?: boolean
}

export function CustomerSearchableSelect({
  customers,
  value,
  onValueChange,
  placeholder = "Select customer...",
  className,
  disabled = false,
  loading = false,
}: CustomerSearchableSelectProps) {
  // Filter out customers with null/undefined customerCode and ensure unique values
  const validCustomers = customers.filter((customer) => 
    customer.customerCode && 
    customer.customerCode.trim() !== ''
  )

  // Remove duplicates based on customerCode
  const uniqueCustomers = validCustomers.reduce((acc, customer) => {
    const existing = acc.find(c => c.customerCode === customer.customerCode)
    if (!existing) {
      acc.push(customer)
    }
    return acc
  }, [] as typeof validCustomers)

  const options: SearchableSelectOption[] = uniqueCustomers.map((customer) => ({
    value: customer.customerCode,
    label: customer.name,
    description: `ID: ${customer.id}`,
  }))


  return (
    <SearchableSelect
      options={options}
      value={value}
      onValueChange={onValueChange}
      placeholder={placeholder}
      searchPlaceholder="Search customers..."
      emptyMessage="No customers found."
      className={className}
      disabled={disabled}
      loading={loading}
    />
  )
} 