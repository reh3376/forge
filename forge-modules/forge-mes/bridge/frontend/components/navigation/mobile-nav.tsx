'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { LogoAuto } from '@/components/ui/logo'
import { useNavigation } from '@/hooks/use-navigation'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'

interface MobileNavProps {
  className?: string
}

export function MobileNav({ className }: MobileNavProps) {
  const [open, setOpen] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['operations']))
  const { mainNavigation, sidebarNavigation, isActive } = useNavigation()

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId)
      } else {
        newSet.add(sectionId)
      }
      return newSet
    })
  }

  return (
    <div className={cn("md:hidden", className)}>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="sm" className="px-2">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-80 overflow-y-auto">
          <div className="flex flex-col space-y-4 mt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <LogoAuto
                  variant="logotype"
                  size="xs"
                  className="h-5 w-auto"
                  priority={true}
                />
                <span className="text-lg font-semibold">Navigation</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                className="px-2"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Main Navigation */}
            <div>
              <h3 className="mb-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Main
              </h3>
              <nav className="flex flex-col space-y-1">
                {mainNavigation.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href)

                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setOpen(false)}
                    >
                      <Button
                        variant={active ? "default" : "ghost"}
                        className={cn(
                          "w-full justify-start space-x-3",
                          active && "bg-primary text-primary-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Button>
                    </Link>
                  )
                })}
              </nav>
            </div>

            <Separator />

            {/* Sidebar Navigation Sections */}
            <div className="space-y-4">
              {sidebarNavigation.map((section) => (
                <div key={section.id}>
                  <button
                    onClick={() => toggleSection(section.id)}
                    className="flex items-center justify-between w-full px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground"
                  >
                    <span>{section.label}</span>
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 transition-transform",
                        expandedSections.has(section.id) ? "transform rotate-180" : ""
                      )}
                    />
                  </button>
                  {expandedSections.has(section.id) && (
                    <nav className="flex flex-col space-y-1 mt-2">
                      {section.items.map((item) => {
                        const Icon = item.icon
                        const active = isActive(item.href)

                        return (
                          <Link
                            key={item.id}
                            href={item.href}
                            onClick={() => setOpen(false)}
                          >
                            <Button
                              variant={active ? "default" : "ghost"}
                              size="sm"
                              className={cn(
                                "w-full justify-start space-x-3",
                                active && "bg-primary text-primary-foreground"
                              )}
                            >
                              <Icon className="h-4 w-4" />
                              <span className="text-sm">{item.label}</span>
                            </Button>
                          </Link>
                        )
                      })}
                    </nav>
                  )}
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
} 