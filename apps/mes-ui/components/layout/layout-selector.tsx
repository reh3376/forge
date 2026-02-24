'use client'

import { useState } from 'react'
import { Check, ChevronDown, PanelLeft, PanelRight, Maximize, Columns } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLayout } from '@/hooks/use-layout'
import { LAYOUT_CONFIGS, LayoutType } from '@/lib/layout'

const iconMap = {
  PanelLeft,
  PanelRight,
  Maximize,
  Columns
}

interface LayoutSelectorProps {
  variant?: 'default' | 'compact'
  showLabel?: boolean
  mode?: 'dropdown' | 'icons'
}

export function LayoutSelector({ 
  variant = 'default', 
  showLabel = true, 
  mode = 'dropdown' 
}: LayoutSelectorProps) {
  const { currentLayout, currentConfig, setLayout } = useLayout()
  const [open, setOpen] = useState(false)

  const handleLayoutChange = (layoutType: LayoutType) => {
    console.log('🔄 Layout change requested:', {
      from: currentLayout,
      to: layoutType,
      currentConfig: currentConfig.name
    })
    setLayout(layoutType)
    setOpen(false)
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
  }

  const CurrentIcon = iconMap[currentConfig.icon as keyof typeof iconMap]

  // Debug logging
  console.log('🎨 LayoutSelector render:', {
    currentLayout,
    currentConfig: currentConfig.name,
    shouldShowSidebar: currentConfig.showSidebar,
    sidebarPosition: currentConfig.sidebarPosition,
    mode
  })

  // Icons mode - show only the icon buttons
  if (mode === 'icons') {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleLayoutChange('sidebar-left')}
          className={currentLayout === 'sidebar-left' ? 'bg-primary text-primary-foreground' : ''}
          title="Sidebar Left"
        >
          <PanelLeft className="h-3 w-3" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleLayoutChange('sidebar-right')}
          className={currentLayout === 'sidebar-right' ? 'bg-primary text-primary-foreground' : ''}
          title="Sidebar Right"
        >
          <PanelRight className="h-3 w-3" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleLayoutChange('full-width')}
          className={currentLayout === 'full-width' ? 'bg-primary text-primary-foreground' : ''}
          title="Full Width"
        >
          <Maximize className="h-3 w-3" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleLayoutChange('split-view')}
          className={currentLayout === 'split-view' ? 'bg-primary text-primary-foreground' : ''}
          title="Split View"
        >
          <Columns className="h-3 w-3" />
        </Button>
      </div>
    )
  }

  // Dropdown mode - show only the dropdown
  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={variant === 'compact' ? 'sm' : 'default'}
          className="gap-2"
          aria-label="Select workspace layout"
        >
          <CurrentIcon className="h-4 w-4" />
          {showLabel && (
            <>
              <span className="hidden sm:inline">{currentConfig.name}</span>
              <ChevronDown className="h-4 w-4" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Workspace Layout</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Object.values(LAYOUT_CONFIGS).map((config) => {
          const Icon = iconMap[config.icon as keyof typeof iconMap]
          const isSelected = config.id === currentLayout
          
          return (
            <DropdownMenuItem
              key={config.id}
              onClick={() => handleLayoutChange(config.id)}
              className="flex items-center gap-3 cursor-pointer"
            >
              <Icon className="h-4 w-4" />
              <div className="flex-1">
                <div className="font-medium">{config.name}</div>
                <div className="text-xs text-muted-foreground">
                  {config.description}
                </div>
              </div>
              {isSelected && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            console.log('🔄 Reset to default layout')
            setLayout('sidebar-left')
            setOpen(false)
          }}
          className="text-muted-foreground"
        >
          Reset to Default
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Compact version for mobile or space-constrained areas
export function CompactLayoutSelector() {
  return <LayoutSelector variant="compact" showLabel={false} />
}

// Icons-only version for toolbars
export function IconLayoutSelector() {
  return <LayoutSelector mode="icons" />
} 