'use client'

import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNavigation } from '@/hooks/use-navigation'

interface BreadcrumbProps {
  className?: string
  showHomeIcon?: boolean
  separator?: React.ReactNode
}

export function Breadcrumb({ 
  className, 
  showHomeIcon = true, 
  separator = <ChevronRight className="h-4 w-4 text-muted-foreground" />
}: BreadcrumbProps) {
  const { breadcrumbs } = useNavigation()

  if (breadcrumbs.length <= 1) {
    return null // Don't show breadcrumbs if only one item (Dashboard)
  }

  return (
    <nav 
      aria-label="Breadcrumb" 
      className={cn("flex items-center space-x-1 text-sm text-muted-foreground", className)}
    >
      <ol className="flex items-center space-x-1">
        {breadcrumbs.map((breadcrumb, index) => {
          const isLast = index === breadcrumbs.length - 1
          const isFirst = index === 0

          return (
            <li key={breadcrumb.href} className="flex items-center">
              {/* Separator (except for first item) */}
              {!isFirst && (
                <span className="mx-2" aria-hidden="true">
                  {separator}
                </span>
              )}

              {/* Breadcrumb item */}
              {isLast ? (
                // Current page - not clickable
                <span 
                  className="font-medium text-foreground"
                  aria-current="page"
                >
                  {isFirst && showHomeIcon && breadcrumb.href === '/' ? (
                    <span className="flex items-center">
                      <Home className="h-4 w-4 mr-1" />
                      {breadcrumb.label}
                    </span>
                  ) : (
                    breadcrumb.label
                  )}
                </span>
              ) : (
                // Previous pages - clickable
                <Link
                  href={breadcrumb.href}
                  className={cn(
                    "hover:text-foreground transition-colors",
                    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm px-1 py-0.5"
                  )}
                >
                  {isFirst && showHomeIcon && breadcrumb.href === '/' ? (
                    <span className="flex items-center">
                      <Home className="h-4 w-4 mr-1" />
                      {breadcrumb.label}
                    </span>
                  ) : (
                    breadcrumb.label
                  )}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// Compact version for mobile or tight spaces
export function BreadcrumbCompact({ className }: { className?: string }) {
  const { breadcrumbs } = useNavigation()

  if (breadcrumbs.length <= 1) {
    return null
  }

  const currentPage = breadcrumbs[breadcrumbs.length - 1]
  const parentPage = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2] : null

  if (!currentPage) {
    return null
  }

  return (
    <nav 
      aria-label="Breadcrumb" 
      className={cn("flex items-center space-x-1 text-sm text-muted-foreground", className)}
    >
      {parentPage && (
        <>
          <Link
            href={parentPage.href}
            className="hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm px-1 py-0.5"
          >
            {parentPage.label}
          </Link>
          <ChevronRight className="h-4 w-4" />
        </>
      )}
      <span className="font-medium text-foreground" aria-current="page">
        {currentPage.label}
      </span>
    </nav>
  )
} 