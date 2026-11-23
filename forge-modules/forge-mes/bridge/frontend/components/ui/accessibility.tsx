"use client"

import React from 'react'
import { cn } from '@/lib/utils'
import { AlertTriangle, Volume2, VolumeX } from 'lucide-react'

// Types for accessibility components
interface AccessibleStatusProps {
  status: 'success' | 'warning' | 'error' | 'info'
  children: React.ReactNode
  className?: string
  announce?: boolean
  size?: 'sm' | 'md' | 'lg'
}

interface TouchTargetProps {
  children: React.ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  as?: React.ElementType
}

interface HighContrastModeProps {
  children: React.ReactNode
  enabled?: boolean
  className?: string
}

interface FactoryAccessibilityProps {
  children: React.ReactNode
  gloveMode?: boolean
  highContrast?: boolean
  className?: string
}

// WCAG 2.1 AA compliant status announcements
export function AccessibleStatus({ 
  status, 
  children, 
  className, 
  announce = true,
  size = 'md' 
}: AccessibleStatusProps) {
  const statusColors = {
    success: 'bg-green-100 text-green-900 border-green-200 dark:bg-green-900/20 dark:text-green-100 dark:border-green-800',
    warning: 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/20 dark:text-amber-100 dark:border-amber-800',
    error: 'bg-red-100 text-red-900 border-red-200 dark:bg-red-900/20 dark:text-red-100 dark:border-red-800',
    info: 'bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-900/20 dark:text-blue-100 dark:border-blue-800'
  }

  const sizeClasses = {
    sm: 'text-sm p-2',
    md: 'text-base p-3',
    lg: 'text-lg p-4'
  }

  const ariaLiveValue = announce 
    ? (status === 'error' ? 'assertive' : 'polite')
    : 'off'

  return (
    <div 
      className={cn(
        'border rounded-lg font-medium',
        statusColors[status],
        sizeClasses[size],
        className
      )}
      role="status"
      aria-live={ariaLiveValue}
      aria-atomic="true"
    >
      {children}
    </div>
  )
}

// Touch-friendly target areas for factory workers wearing gloves
export function TouchTarget({ 
  children, 
  className, 
  size = 'lg',
  as: Component = 'button' 
}: TouchTargetProps) {
  const sizeClasses = {
    sm: 'min-h-[40px] min-w-[40px]', // Still above WCAG minimum
    md: 'min-h-[44px] min-w-[44px]', // WCAG 2.1 AA minimum
    lg: 'min-h-[56px] min-w-[56px]', // Recommended for factory use
    xl: 'min-h-[64px] min-w-[64px]'  // Large gloves/thick protection
  }

  return (
    <Component
      className={cn(
        'inline-flex items-center justify-center',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        'active:scale-95 transition-transform duration-150',
        sizeClasses[size],
        className
      )}
    >
      {children}
    </Component>
  )
}

// High contrast mode for bright factory environments
export function HighContrastMode({ children, enabled = false, className }: HighContrastModeProps) {
  if (!enabled) return <>{children}</>

  return (
    <div 
      className={cn(
        'high-contrast-mode',
        // Enhanced contrast for factory lighting
        '[&_*]:!text-black [&_*]:!bg-white [&_*]:!border-black',
        '[&_button]:!bg-yellow-400 [&_button]:!text-black [&_button]:!border-2 [&_button]:!border-black',
        '[&_.status-running]:!bg-green-600 [&_.status-running]:!text-white',
        '[&_.status-error]:!bg-red-600 [&_.status-error]:!text-white',
        '[&_.status-warning]:!bg-orange-600 [&_.status-warning]:!text-black',
        className
      )}
    >
      {children}
    </div>
  )
}

// Factory-specific accessibility wrapper
export function FactoryAccessibility({ 
  children, 
  gloveMode = false,
  highContrast = false,
  className 
}: FactoryAccessibilityProps) {
  return (
    <div 
      className={cn(
        'factory-accessibility',
        // Base accessibility features
        '[&_input]:min-h-[44px] [&_select]:min-h-[44px] [&_textarea]:min-h-[44px]',
        '[&_button]:min-h-[44px] [&_a]:min-h-[44px]',
        
        // Glove mode - larger touch targets and spacing
        gloveMode && [
          '[&_input]:min-h-[56px] [&_select]:min-h-[56px] [&_textarea]:min-h-[56px]',
          '[&_button]:min-h-[56px] [&_a]:min-h-[56px]',
          '[&_*]:text-lg [&_*]:leading-relaxed',
          'space-y-4 [&_*]:m-2'
        ],
        
        // High contrast for bright environments
        highContrast && [
          '[&_*]:!border-2 [&_*]:!border-black',
          '[&_input]:!bg-white [&_input]:!text-black',
          '[&_button]:!bg-yellow-400 [&_button]:!text-black',
          '[&_.bg-green-500]:!bg-green-600',
          '[&_.bg-red-500]:!bg-red-600',
          '[&_.bg-blue-500]:!bg-blue-600'
        ],
        
        className
      )}
    >
      {children}
    </div>
  )
}

// Accessible alert for critical manufacturing alerts
export function FactoryAlert({ 
  level = 'info',
  title,
  children,
  onDismiss,
  audioAlert = false,
  className
}: {
  level?: 'info' | 'warning' | 'error' | 'success'
  title: string
  children: React.ReactNode
  onDismiss?: () => void
  audioAlert?: boolean
  className?: string
}) {
  const [soundEnabled, setSoundEnabled] = React.useState(audioAlert)

  const levelStyles = {
    info: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-100',
    warning: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-100',
    error: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-900/20 dark:border-red-800 dark:text-red-100',
    success: 'bg-green-50 border-green-200 text-green-900 dark:bg-green-900/20 dark:border-green-800 dark:text-green-100'
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={cn(
        'border-l-4 p-4 rounded-lg',
        levelStyles[level],
        className
      )}
    >
      <div className="flex items-start">
        <div className="flex-shrink-0">
          {level === 'error' && <AlertTriangle className="h-6 w-6" aria-hidden="true" />}
        </div>
        
        <div className="ml-3 flex-1">
          <h3 className="text-lg font-medium mb-2">
            {title}
          </h3>
          <div className="text-sm">
            {children}
          </div>
        </div>

        <div className="flex items-center space-x-2 ml-4">
          {audioAlert && (
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 rounded hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label={soundEnabled ? "Disable audio alerts" : "Enable audio alerts"}
            >
              {soundEnabled ? (
                <Volume2 className="h-5 w-5" />
              ) : (
                <VolumeX className="h-5 w-5" />
              )}
            </button>
          )}
          
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="p-2 rounded hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Dismiss alert"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Skip navigation for assistive technologies
export function SkipNavigation() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
    >
      Skip to main content
    </a>
  )
}

// Responsive breakpoint utilities for factory devices
export const factoryBreakpoints = {
  // Factory tablet (landscape)
  tablet: '768px',
  // Large monitoring screen
  monitor: '1024px', 
  // Wall-mounted displays
  wall: '1440px',
  // Large control room displays
  control: '1920px'
}

// Accessibility context for factory settings
export const FactoryAccessibilityContext = React.createContext({
  gloveMode: false,
  highContrast: false,
  soundEnabled: true,
  fontSize: 'normal' as 'small' | 'normal' | 'large',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setGloveMode: (_: boolean) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setHighContrast: (_: boolean) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setSoundEnabled: (_: boolean) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setFontSize: (_: 'small' | 'normal' | 'large') => {}
})

export function useFactoryAccessibility() {
  return React.useContext(FactoryAccessibilityContext)
} 