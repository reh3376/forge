'use client'

import { Breadcrumb } from '@/components/navigation/breadcrumb'
import { PageTransition, RouteLoadingIndicator } from '@/components/layout/page-transition'
import { useLayout } from '@/hooks/use-layout'
import { cn } from '@/lib/utils'

interface MainContentProps {
  children: React.ReactNode
  className?: string
  showBreadcrumbs?: boolean
}

export function MainContent({
  children,
  className,
  showBreadcrumbs = true
}: MainContentProps) {
  const { currentConfig } = useLayout()

  // Determine container classes based on layout
  const containerClasses = cn(
    // Base padding for all layouts
    "p-2 md:p-3",
    {
      // Full width layouts get full width with responsive padding
      "w-full max-w-none": currentConfig.contentWidth === 'full',
      // Contained layouts get container with max-width and centered content
      "container mx-auto max-w-7xl": currentConfig.contentWidth === 'contained',
    }
  )

  return (
    <main className={cn("flex-1 overflow-y-auto bg-background", className)}>
      <RouteLoadingIndicator />
      <div className={containerClasses}>
        {showBreadcrumbs && (
          <div className="mb-6">
            <Breadcrumb />
          </div>
        )}
        <PageTransition>
          {children}
        </PageTransition>
      </div>
    </main>
  )
} 