'use client'

import { cn } from '@/lib/utils'

interface SidebarSkeletonProps {
  className?: string
  position?: 'left' | 'right'
}

export function SidebarSkeleton({ className, position = 'left' }: SidebarSkeletonProps) {
  return (
    <aside
      className={cn(
        // Base sidebar class for CSS targeting
        "sidebar-skeleton",
        // Mobile: fixed positioning
        "fixed top-16 z-50 h-[calc(100vh-4rem)] bg-background/50 backdrop-blur-sm",
        // Desktop: fixed positioning for consistent behavior
        "md:fixed md:top-16 md:h-[calc(100vh-4rem)]",
        // Width
        "w-64",
        // Position based on sidebar side
        position === 'right' 
          ? "right-0 border-l" 
          : "left-0 border-r",
        // Add position-specific classes for styling
        position === 'right' ? "sidebar-right" : "sidebar-left",
        // Ensure proper layering
        "md:z-30",
        className
      )}
      aria-label="Loading sidebar"
    >
      <div className="flex h-full flex-col animate-pulse">
        {/* Sidebar Header Skeleton */}
        <div className="flex items-center justify-between border-b py-3 px-4">
          <div className="h-4 w-20 bg-muted rounded" />
          <div className="h-8 w-8 bg-muted rounded" />
        </div>

        {/* Sidebar Content Skeleton */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
          {/* Navigation sections */}
          {Array.from({ length: 3 }).map((_, sectionIndex) => (
            <div key={sectionIndex} className="space-y-2">
              {/* Section header */}
              <div className="h-4 w-24 bg-muted rounded" />
              
              {/* Section items */}
              <div className="space-y-1">
                {Array.from({ length: 3 }).map((_, itemIndex) => (
                  <div key={itemIndex} className="flex items-center space-x-3 p-2">
                    <div className="h-4 w-4 bg-muted rounded" />
                    <div className="h-4 w-16 bg-muted rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
} 