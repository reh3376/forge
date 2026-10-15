'use client'

import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/hooks/use-sidebar'

import { cn } from '@/lib/utils'

interface SidebarToggleProps {
  className?: string
}

export function SidebarToggle({ className }: SidebarToggleProps) {
  const { toggle, isOpen } = useSidebar()

  const handleToggle = () => {
    console.log('SidebarToggle clicked, current isOpen:', isOpen)
    toggle()
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      className={cn("h-8 w-8 p-0", className)}
      title={isOpen ? "Close sidebar" : "Open sidebar"}
      aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
    >
      <Menu className="h-4 w-4" />
    </Button>
  )
} 