"use client"

import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/ui/equipment-status'
import { Badge } from '@/components/ui/badge'



interface ThreePanelLayoutProps {
  children: React.ReactNode
  leftPanel?: React.ReactNode
  centerPanel?: React.ReactNode
  rightPanel?: React.ReactNode
  className?: string
}

interface PageContainerProps {
  children: React.ReactNode
  className?: string
  showSidebar?: boolean
  showHeader?: boolean
}

// Legacy navigation items - kept for reference but not used
// Use components/navigation/sidebar.tsx for actual navigation





// Three-Panel Layout for production scheduling
export function ThreePanelLayout({ 
  children, 
  leftPanel, 
  centerPanel, 
  rightPanel, 
  className 
}: ThreePanelLayoutProps) {
  return (
    <div className={cn(
      "flex h-full min-h-[600px] divide-x divide-border",
      className
    )}>
      {/* Left Panel - Lists/Filters */}
      {leftPanel && (
        <div className="w-80 flex-shrink-0 bg-card/30 overflow-y-auto">
          {leftPanel}
        </div>
      )}
      
      {/* Center Panel - Main Content/Table */}
      <div className="flex-1 overflow-y-auto">
        {centerPanel || children}
      </div>
      
      {/* Right Panel - Forms/Details */}
      {rightPanel && (
        <div className="w-96 flex-shrink-0 bg-card/30 overflow-y-auto">
          {rightPanel}
        </div>
      )}
    </div>
  )
}

// Page Container with responsive layout
// Note: This component is now simplified. For full sidebar functionality,
// use WorkspaceLayout from components/layout/workspace-layout.tsx
export function PageContainer({
  children,
  className
}: Omit<PageContainerProps, 'showSidebar' | 'showHeader'>) {
  return (
    <div className={cn("flex flex-col min-h-full bg-background", className)}>
      {/* Main Content Area - uses min-h-0 to allow flex child to scroll */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Page Content - allows scrolling within the flex layout */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

        {/* Footer - stays at bottom */}
        <footer className="flex-shrink-0 border-t bg-card/30 p-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>© 2025 Whiskey House of Kentucky</span>
            <div className="flex items-center space-x-2">
              <StatusDot status="running" size="sm" />
              <span>All Systems Operational</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

// Production Order Filter Panel Component
export function ProductionOrderPanel({ className }: { className?: string }) {
  const [filter, setFilter] = useState<'all' | 'unscheduled'>('all')

  return (
    <div className={cn("p-4 space-y-4", className)}>
      <div>
        <h3 className="font-semibold mb-3">Production Orders</h3>
        <div className="flex space-x-2 mb-4">
          <Button 
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            View All
          </Button>
          <Button 
            variant={filter === 'unscheduled' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('unscheduled')}
          >
            Show Unscheduled
          </Button>
        </div>
      </div>
      
      {/* Order List */}
      <div className="space-y-2">
        {[
          { id: 'PO-2025-001', customer: 'BHK', status: 'scheduled' },
          { id: 'PO-2025-002', customer: 'PAW', status: 'unscheduled' },
          { id: 'PO-2025-003', customer: 'HNW', status: 'scheduled' },
          { id: 'PO-2025-004', customer: 'ABT', status: 'unscheduled' },
        ].map((order) => (
          <div 
            key={order.id}
            className="p-3 border rounded-lg hover:bg-accent cursor-pointer"
          >
            <div className="font-medium">{order.id}</div>
            <div className="text-sm text-muted-foreground">{order.customer}</div>
            <Badge 
              variant={order.status === 'scheduled' ? 'default' : 'secondary'}
              className="mt-1"
            >
              {order.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

// Schedule Table Component
export function ScheduleTable({ className }: { className?: string }) {
  return (
    <div className={cn("p-4", className)}>
      <h3 className="font-semibold mb-4">Production Schedule</h3>
      <div className="border rounded-lg">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr className="text-sm">
                <th className="text-left p-3">Index</th>
                <th className="text-left p-3">Sch Order</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-left p-3">Prod Order</th>
                <th className="text-left p-3">Mash Bill</th>
                <th className="text-left p-3">Est. POs</th>
                <th className="text-left p-3">Mash Date</th>
                <th className="text-left p-3">Ferm Start</th>
                <th className="text-left p-3">Ferm End</th>
                <th className="text-left p-3">Distill Date</th>
                <th className="text-left p-3">Barrel Date</th>
                <th className="text-left p-3">Cooks</th>
                <th className="text-left p-3">Forms</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  index: 1,
                  schOrder: 'SO-001',
                  customer: 'BHK',
                  prodOrder: 'PO-2025-001',
                  mashBill: '75-21-04-00',
                  estPOs: '150',
                  mashDate: '2025-05-24',
                  fermStart: '2025-05-25',
                  fermEnd: '2025-05-29',
                  distillDate: '2025-05-30',
                  barrelDate: '2025-05-31',
                  cooks: '4',
                  forms: 'View'
                },
                {
                  index: 2,
                  schOrder: 'SO-002',
                  customer: 'PAW',
                  prodOrder: 'PO-2025-002',
                  mashBill: '60-40-00-00',
                  estPOs: '200',
                  mashDate: '2025-05-26',
                  fermStart: '2025-05-27',
                  fermEnd: '2025-05-31',
                  distillDate: '2025-06-01',
                  barrelDate: '2025-06-02',
                  cooks: '3',
                  forms: 'View'
                }
              ].map((row) => (
                <tr key={row.index} className="border-b hover:bg-muted/50 text-sm">
                  <td className="p-3">{row.index}</td>
                  <td className="p-3">{row.schOrder}</td>
                  <td className="p-3">{row.customer}</td>
                  <td className="p-3">{row.prodOrder}</td>
                  <td className="p-3">{row.mashBill}</td>
                  <td className="p-3">{row.estPOs}</td>
                  <td className="p-3">{row.mashDate}</td>
                  <td className="p-3">{row.fermStart}</td>
                  <td className="p-3">{row.fermEnd}</td>
                  <td className="p-3">{row.distillDate}</td>
                  <td className="p-3">{row.barrelDate}</td>
                  <td className="p-3">{row.cooks}</td>
                  <td className="p-3">
                    <Button variant="outline" size="sm">
                      {row.forms}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Order Form Panel Component
export function OrderFormPanel({ className }: { className?: string }) {
  return (
    <div className={cn("p-4 space-y-4", className)}>
      <h3 className="font-semibold">Add to Schedule</h3>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="production-order-select" className="text-sm font-medium">Production Order</label>
          <select 
            id="production-order-select"
            className="w-full mt-1 p-2 border rounded"
            aria-label="Select production order"
          >
            <option>Select Order</option>
            <option>PO-2025-002</option>
            <option>PO-2025-004</option>
          </select>
        </div>
        
        <div>
          <label htmlFor="mash-date-input" className="text-sm font-medium">Mash Date</label>
          <input 
            id="mash-date-input"
            type="date" 
            className="w-full mt-1 p-2 border rounded"
            defaultValue="2025-05-24"
            aria-label="Mash date"
          />
        </div>
        
        <div>
          <label htmlFor="customer-select" className="text-sm font-medium">Customer</label>
          <select 
            id="customer-select"
            className="w-full mt-1 p-2 border rounded"
            aria-label="Select customer"
          >
            <option>BHK</option>
            <option>PAW</option>
            <option>HNW</option>
            <option>ABT</option>
          </select>
        </div>
        
        <div>
          <label htmlFor="mash-bill-input" className="text-sm font-medium">Mash Bill</label>
          <input 
            id="mash-bill-input"
            type="text" 
            className="w-full mt-1 p-2 border rounded"
            placeholder="75-21-04-00"
            aria-label="Mash bill composition"
          />
        </div>
        
        <Button className="w-full">
          Add to Schedule
        </Button>
      </div>
    </div>
  )
} 