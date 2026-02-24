"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const tabsListVariants = cva(
  "inline-flex items-center",
  {
    variants: {
      variant: {
        classic: "h-10 bg-muted rounded-lg p-1",
        modern: "h-12 bg-transparent border-b border-border",
        ignition: "h-11 bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 border border-border rounded-t-lg",
      },
    },
    defaultVariants: {
      variant: "ignition",
    },
  }
)

const tabsTriggerVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        classic: "rounded-md px-3 py-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        modern: "px-4 py-3 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary hover:text-foreground",
        ignition: "px-4 py-2 bg-gradient-to-b from-cyan-100 to-cyan-200 dark:from-cyan-800 dark:to-cyan-900 text-cyan-900 dark:text-cyan-100 border-r border-border first:rounded-tl-lg last:rounded-tr-lg last:border-r-0 data-[state=active]:from-cyan-300 data-[state=active]:to-cyan-400 data-[state=active]:dark:from-cyan-600 data-[state=active]:dark:to-cyan-700 data-[state=active]:text-cyan-950 data-[state=active]:dark:text-cyan-50 data-[state=active]:font-semibold data-[state=active]:shadow-inner hover:from-cyan-200 hover:to-cyan-300 hover:dark:from-cyan-700 hover:dark:to-cyan-800",
      },
    },
    defaultVariants: {
      variant: "ignition",
    },
  }
)

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>,
    VariantProps<typeof tabsListVariants> {}

export interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>,
    VariantProps<typeof tabsTriggerVariants> {}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(tabsListVariants({ variant }), className)}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, variant, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(tabsTriggerVariants({ variant }), className)}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const tabsContentVariants = cva(
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        classic: "mt-2",
        modern: "mt-4",
        ignition: "bg-card border border-t-0 border-border rounded-b-lg p-4 shadow-sm",
      },
    },
    defaultVariants: {
      variant: "ignition",
    },
  }
)

export interface TabsContentProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>,
    VariantProps<typeof tabsContentVariants> {}

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  TabsContentProps
>(({ className, variant, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(tabsContentVariants({ variant }), className)}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
