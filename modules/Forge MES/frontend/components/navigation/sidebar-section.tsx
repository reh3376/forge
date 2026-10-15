'use client'

import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavigation } from '@/hooks/use-navigation'
import { cn } from '@/lib/utils'
import type { NavigationSection } from '@/lib/navigation'

interface SidebarSectionProps {
  section: NavigationSection
  isCollapsed: boolean
  onToggle: () => void
  className?: string
}

export function SidebarSection({ 
  section, 
  isCollapsed, 
  onToggle, 
  className 
}: SidebarSectionProps) {
  const { isActive } = useNavigation()

  return (
    <div className={cn("space-y-1", className)}>
      {/* Section Header */}
      <Button
        variant="ghost"
        onClick={onToggle}
        className="w-full justify-between px-3 py-2 h-auto text-sm font-medium text-muted-foreground hover:text-foreground"
        aria-expanded={!isCollapsed}
        aria-controls={`sidebar-section-${section.id}`}
      >
        <span>{section.label}</span>
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 transition-transform" />
        ) : (
          <ChevronDown className="h-4 w-4 transition-transform" />
        )}
      </Button>

      {/* Section Items */}
      <div
        id={`sidebar-section-${section.id}`}
        className={cn(
          "space-y-1 overflow-hidden transition-all duration-200 ease-in-out",
          isCollapsed ? "max-h-0 opacity-0" : "max-h-96 opacity-100"
        )}
      >
        {section.items.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          
          return (
            <Link key={item.id} href={item.href}>
              <Button
                variant={active ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start px-6 py-2 h-auto text-sm",
                  active && "bg-secondary text-secondary-foreground font-medium"
                )}
                title={item.description}
              >
                <Icon className="h-4 w-4 mr-3 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.badge && (
                  <span className="ml-auto px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                    {item.badge}
                  </span>
                )}
              </Button>
            </Link>
          )
        })}
      </div>
    </div>
  )
} 