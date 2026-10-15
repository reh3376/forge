'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { X, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LogoAuto } from '@/components/ui/logo'

import { useNavigation } from '@/hooks/use-navigation'
import { useSidebar } from '@/hooks/use-sidebar'
import { useLayout } from '@/hooks/use-layout'
import { SidebarSection } from './sidebar-section'
import { cn } from '@/lib/utils'

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const { sidebarNavigation } = useNavigation()
  const { shouldShowSidebar, currentConfig, isLoading: layoutLoading } = useLayout()
  const {
    isOpen,
    isLoaded,
    toggle,
    close,
    toggleSection,
    isSectionCollapsed
  } = useSidebar()

  // Determine if sidebar is on the right
  const isRightSidebar = currentConfig.sidebarPosition === 'right'

  // Debug logging
  console.log('📋 Sidebar render:', {
    shouldShowSidebar,
    layoutId: currentConfig.id,
    sidebarPosition: currentConfig.sidebarPosition,
    isRightSidebar,
    isOpen,
    isLoaded,
    layoutLoading
  })

  // Close sidebar on mobile when clicking outside
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && !isOpen) {
        // Auto-open on desktop if closed
        // toggle()
      }
    }

    const handleLayoutChange = (event: CustomEvent) => {
      console.log('📋 Sidebar: Layout changed event received:', event.detail)
      // Force a re-render by triggering a state update
      // This ensures the sidebar updates its positioning when layout changes
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('layout-changed', handleLayoutChange as EventListener)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('layout-changed', handleLayoutChange as EventListener)
    }
  }, [isOpen])

  // Don't render until both layout and sidebar are ready to prevent hydration issues
  // Wait for both to be loaded to ensure consistent rendering
  if (layoutLoading || !isLoaded) {
    console.log('📋 Sidebar: Not rendering - waiting for layout and sidebar to load:', { layoutLoading, isLoaded })
    return null
  }

  // Don't render sidebar if layout doesn't support it
  if (!shouldShowSidebar) {
    console.log('📋 Sidebar: Not rendering - layout does not support sidebar')
    return null
  }

  // Render sidebar even if sidebar state isn't loaded yet (use default state)
  // This prevents the sidebar from disappearing on initial load
  const effectiveIsOpen = isLoaded ? isOpen : true // Default to open if not loaded

  return (
    <>
      {/* Mobile Overlay */}
      {effectiveIsOpen && (
        <div 
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          // Base sidebar class for CSS targeting
          "sidebar",
          // Mobile: fixed positioning
          "fixed top-16 z-50 h-[calc(100vh-4rem)] transform bg-background transition-all duration-200 ease-in-out",
          // Desktop: fixed positioning for consistent behavior
          "md:fixed md:top-16 md:h-[calc(100vh-4rem)]",
          // Width based on open state
          effectiveIsOpen ? "w-64" : "w-12",
          // Position based on sidebar side
          isRightSidebar 
            ? "right-0 border-l" 
            : "left-0 border-r",
          // Mobile transform based on open state and position
          "md:translate-x-0",
          effectiveIsOpen 
            ? "translate-x-0" 
            : isRightSidebar 
              ? "translate-x-full md:translate-x-0" 
              : "-translate-x-full md:translate-x-0",
          // Hide sidebar on mobile by default
          "hidden md:block",
          effectiveIsOpen && "block md:block",
          // Add position-specific classes for styling
          isRightSidebar ? "sidebar-right" : "sidebar-left",
          // Ensure proper layering
          "md:z-30",
          className
        )}
        aria-label="Sidebar navigation"
        data-position={currentConfig.sidebarPosition}
        data-open={effectiveIsOpen}
      >
        <div className="flex h-full flex-col">
          {/* Sidebar Header */}
          <div className={cn(
            "flex items-center border-b py-3",
            effectiveIsOpen ? "justify-between px-4" : "justify-center px-2"
          )}>
            {effectiveIsOpen ? (
              <>
                <div className="flex items-center space-x-2">
                  <LogoAuto 
                    variant="logotype" 
                    size="xs" 
                    className="h-5 w-auto"
                    priority={true}
                    useSvg={true}
                  />
                  <span className="text-xs text-muted-foreground">Navigation</span>
                </div>
              </>
            ) : (
              <LogoAuto 
                variant="symbol" 
                size="xs" 
                className="h-4 w-4"
                priority={true}
                useSvg={true}
              />
            )}
            <div className="flex items-center space-x-1">
              {/* Desktop Toggle - use appropriate icon based on position */}
              <Button
                variant="ghost"
                size="sm"
                onClick={toggle}
                className="hidden md:flex h-8 w-8 p-0"
                title={effectiveIsOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                {isRightSidebar ? (
                  effectiveIsOpen ? (
                    <PanelRightClose className="h-4 w-4" />
                  ) : (
                    <PanelRightOpen className="h-4 w-4" />
                  )
                ) : (
                  effectiveIsOpen ? (
                    <PanelLeftClose className="h-4 w-4" />
                  ) : (
                    <PanelLeftOpen className="h-4 w-4" />
                  )
                )}
              </Button>
              
              {/* Mobile Close */}
              <Button
                variant="ghost"
                size="sm"
                onClick={close}
                className="md:hidden h-8 w-8 p-0"
                title="Close sidebar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Sidebar Content */}
          <div className={cn(
            "flex-1 overflow-y-auto py-4",
            effectiveIsOpen ? "px-3" : "px-1"
          )}>
            {effectiveIsOpen ? (
              <nav className="space-y-4" role="navigation">
                {sidebarNavigation.map((section) => (
                  <SidebarSection
                    key={section.id}
                    section={section}
                    isCollapsed={isSectionCollapsed(section.id)}
                    onToggle={() => toggleSection(section.id)}
                  />
                ))}
              </nav>
            ) : (
              // Collapsed sidebar - show only icons with proper client-side navigation
              <nav className="space-y-2" role="navigation">
                {sidebarNavigation.map((section) => (
                  <div key={section.id} className="space-y-1">
                    {section.items.map((item) => {
                      const Icon = item.icon
                      return (
                        <Link key={item.id} href={item.href}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full h-10 p-0 justify-center"
                            title={item.label}
                          >
                            <Icon className="h-4 w-4" />
                          </Button>
                        </Link>
                      )
                    })}
                  </div>
                ))}
              </nav>
            )}
          </div>

          {/* Sidebar Footer */}
          <div className={cn(
            "border-t py-3",
            effectiveIsOpen ? "px-4" : "px-2"
          )}>
            <div className={cn(
              "text-xs text-muted-foreground",
              !effectiveIsOpen && "text-center"
            )}>
              {effectiveIsOpen ? "Whiskey House MES" : "MES"}
            </div>
          </div>
        </div>
      </aside>
    </>
  )
} 