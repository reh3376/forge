"use client"

import * as React from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs"

export interface IgnitionTabsProps {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  className?: string
}

export interface IgnitionTabsListProps {
  children: React.ReactNode
  className?: string
}

export interface IgnitionTabProps {
  value: string
  children: React.ReactNode
  disabled?: boolean
  className?: string
}

export interface IgnitionTabPanelProps {
  value: string
  children: React.ReactNode
  className?: string
}

const IgnitionTabs = React.forwardRef<HTMLDivElement, IgnitionTabsProps>(
  ({ className, children, ...props }, ref) => (
    <Tabs
      ref={ref}
      className={className}
      {...props}
    >
      {children}
    </Tabs>
  )
)
IgnitionTabs.displayName = "IgnitionTabs"

const IgnitionTabsList = React.forwardRef<HTMLDivElement, IgnitionTabsListProps>(
  ({ className, children, ...props }, ref) => (
    <TabsList
      ref={ref}
      variant="ignition"
      className={className}
      {...props}
    >
      {children}
    </TabsList>
  )
)
IgnitionTabsList.displayName = "IgnitionTabsList"

const IgnitionTab = React.forwardRef<HTMLButtonElement, IgnitionTabProps>(
  ({ className, ...props }, ref) => (
    <TabsTrigger
      ref={ref}
      variant="ignition"
      className={className}
      {...props}
    />
  )
)
IgnitionTab.displayName = "IgnitionTab"

const IgnitionTabPanel = React.forwardRef<HTMLDivElement, IgnitionTabPanelProps>(
  ({ className, ...props }, ref) => (
    <TabsContent
      ref={ref}
      variant="ignition"
      className={className}
      {...props}
    />
  )
)
IgnitionTabPanel.displayName = "IgnitionTabPanel"

export { 
  IgnitionTabs, 
  IgnitionTabsList, 
  IgnitionTab, 
  IgnitionTabPanel 
}