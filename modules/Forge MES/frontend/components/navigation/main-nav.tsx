'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useNavigation } from '@/hooks/use-navigation'
import { cn } from '@/lib/utils'

interface MainNavProps {
  className?: string
}

export function MainNav({ className }: MainNavProps) {
  const { mainNavigation, isActive } = useNavigation()

  return (
    <nav className={cn("flex items-center space-x-6", className)}>
      {mainNavigation.map((item) => {
        const Icon = item.icon
        const active = isActive(item.href)
        
        return (
          <Link key={item.id} href={item.href}>
            <Button 
              variant={active ? "default" : "ghost"} 
              size="sm" 
              className={cn(
                "flex items-center space-x-2",
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
  )
} 