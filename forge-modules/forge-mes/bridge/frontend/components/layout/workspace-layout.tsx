'use client'

import { ReactNode, useEffect, useRef, useCallback, useState } from 'react'
import { cn } from '@/lib/utils'
import { useLayout } from '@/hooks/use-layout'
import { useSidebar } from '@/hooks/use-sidebar'
import { Sidebar } from '@/components/navigation/sidebar'
import { SidebarSkeleton } from '@/components/navigation/sidebar-skeleton'
import { HydrationBoundary } from './hydration-boundary'

interface WorkspaceLayoutProps {
  children: ReactNode
  className?: string
}

export function WorkspaceLayout({ children, className }: WorkspaceLayoutProps) {
  const { currentConfig, splitViewRatio = 0.5, shouldShowSidebar, currentLayout, setSplitViewRatio } = useLayout()
  const { isOpen: sidebarOpen } = useSidebar()
  const sidebarCollapsed = !sidebarOpen
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Debug when layout changes
  useEffect(() => {
    console.log('🎨 Layout changed to:', currentLayout, currentConfig)
  }, [currentLayout, currentConfig])

  // Drag handlers for split view resizer
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return

    const container = containerRef.current
    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left
    const newRatio = x / rect.width

    // Clamp ratio between 20% and 80%
    const clampedRatio = Math.max(0.2, Math.min(0.8, newRatio))
    setSplitViewRatio(clampedRatio)
  }, [isDragging, setSplitViewRatio])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Add global mouse event listeners for drag
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      // Prevent text selection during drag
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Debug logging
  console.log('🏗️ WorkspaceLayout render:', {
    layoutId: currentConfig.id,
    layoutName: currentConfig.name,
    shouldShowSidebar,
    sidebarPosition: currentConfig.sidebarPosition,
    contentWidth: currentConfig.contentWidth,
    splitView: currentConfig.splitView,
    sidebarCollapsed,
    currentLayout
  })

  // Base layout classes
  const layoutClasses = cn(
    'flex flex-1 bg-background overflow-hidden relative',
    className
  )

  // Add a visual indicator for the current layout
  const layoutIndicator = (
    <div className="absolute top-2 right-2 z-20 px-3 py-1 text-xs font-medium bg-primary/10 text-primary rounded-md pointer-events-none">
      {currentConfig.name}
    </div>
  )

  // Calculate main content classes based on current layout state
  const getMainContentClasses = () => {
    return cn(
      "flex-1 flex flex-col min-w-0 transition-all duration-300",
      // Base: full width on mobile
      "w-full",
      // Desktop: account for fixed sidebar with padding instead of margin
      {
        // Left sidebar spacing
        'md:pl-64': shouldShowSidebar && currentConfig.sidebarPosition === 'left' && !sidebarCollapsed,
        'md:pl-12': shouldShowSidebar && currentConfig.sidebarPosition === 'left' && sidebarCollapsed,
        // Right sidebar spacing  
        'md:pr-64': shouldShowSidebar && currentConfig.sidebarPosition === 'right' && !sidebarCollapsed,
        'md:pr-12': shouldShowSidebar && currentConfig.sidebarPosition === 'right' && sidebarCollapsed,
      }
    )
  }

  // Split view specific rendering
  if (currentConfig.splitView) {
    return (
      <div className={layoutClasses} data-layout={currentConfig.id}>
        {layoutIndicator}

        <div ref={containerRef} className="flex flex-1">
          {/* Sidebar on left for split view */}
          {shouldShowSidebar && currentConfig.sidebarPosition === 'left' && (
            <HydrationBoundary fallback={<SidebarSkeleton position="left" />}>
              <Sidebar />
            </HydrationBoundary>
          )}

          {/* Primary content pane - no margin conflicts in split view */}
          <div
            className="flex flex-col min-w-0 border-r bg-background"
            style={{
              width: `${splitViewRatio * 100}%`,
              // Remove marginLeft to avoid conflicts with fixed sidebar positioning
            }}
          >
            {children}
          </div>

          {/* Split view resizer - draggable */}
          <div
            onMouseDown={handleMouseDown}
            className={cn(
              "w-2 bg-border cursor-col-resize transition-colors flex-shrink-0 relative group",
              "hover:bg-primary/30",
              isDragging && "bg-primary/50"
            )}
          >
            {/* Visual drag handle indicator */}
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-muted-foreground/30 group-hover:bg-primary/50 transition-colors" />
          </div>

          {/* Secondary content pane */}
          <div
            className="flex-1 flex flex-col min-w-0 bg-muted/10"
            style={{ width: `${(1 - splitViewRatio) * 100}%` }}
          >
            <div className="flex-1 p-6 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <div className="text-lg font-medium mb-2">Secondary Panel</div>
                <div className="text-sm">
                  This area can be used for additional content, tools, or reference materials.
                </div>
                <div className="mt-4 text-xs">
                  Split ratio: {Math.round(splitViewRatio * 100)}% / {Math.round((1 - splitViewRatio) * 100)}%
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar on right for split view */}
          {shouldShowSidebar && currentConfig.sidebarPosition === 'right' && (
            <HydrationBoundary fallback={<SidebarSkeleton position="right" />}>
              <Sidebar />
            </HydrationBoundary>
          )}
        </div>
      </div>
    )
  }

  // Standard layout rendering with improved spacing
  return (
    <div className={layoutClasses} data-layout={currentConfig.id}>
      {layoutIndicator}
      
      <div className={cn(
        "flex flex-1 relative",
        currentConfig.sidebarPosition === 'right' && "flex-row-reverse"
      )}>
        {/* Sidebar */}
        {shouldShowSidebar && (
          <HydrationBoundary fallback={<SidebarSkeleton position={currentConfig.sidebarPosition || 'left'} />}>
            <Sidebar />
          </HydrationBoundary>
        )}
        
        {/* Main content area with proper spacing */}
        <div className={getMainContentClasses()}>
          {children}
        </div>
      </div>
    </div>
  )
}

// Layout wrapper with additional styling for specific layouts
export function LayoutContainer({ children, className }: WorkspaceLayoutProps) {
  const { currentConfig } = useLayout()
  
  return (
    <div 
      className={cn(
        'layout-container',
        `layout-${currentConfig.id}`,
        className
      )}
      data-layout={currentConfig.id}
    >
      {children}
    </div>
  )
} 