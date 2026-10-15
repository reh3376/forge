'use client'

import { useState, useEffect } from 'react'
import { HelpCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import type { HelpContent } from './help-content'

interface HelpTooltipProps {
  content: HelpContent
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

export function HelpTooltip({ 
  content, 
  side = 'top',
  className = '' 
}: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  // Close on custom event
  useEffect(() => {
    const handleCloseOverlays = () => {
      setIsOpen(false)
    }

    window.addEventListener('close-overlays', handleCloseOverlays)
    return () => window.removeEventListener('close-overlays', handleCloseOverlays)
  }, [])

  const HelpIcon = () => (
    <Button
      variant="ghost"
      size="sm"
      className={`h-6 w-6 p-0 text-muted-foreground hover:text-foreground ${className}`}
      aria-label="Help"
    >
      <HelpCircle className="h-4 w-4" />
    </Button>
  )

  const HelpContentComponent = () => (
    <div className="space-y-3 max-w-sm">
      <div className="space-y-1">
        <h4 className="font-medium text-sm">{content.title}</h4>
        <p className="text-sm text-muted-foreground">{content.description}</p>
      </div>

      {content.shortcuts && content.shortcuts.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Keyboard Shortcuts
          </h5>
          <div className="flex flex-wrap gap-1">
            {content.shortcuts.map((shortcut, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {shortcut}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {content.tips && content.tips.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Tips
          </h5>
          <ul className="space-y-1">
            {content.tips.map((tip, index) => (
              <li key={index} className="text-xs text-muted-foreground flex items-start">
                <span className="mr-1">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.relatedActions && content.relatedActions.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Quick Actions
          </h5>
          <div className="space-y-1">
            {content.relatedActions.map((action, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                className="h-7 text-xs w-full justify-start"
                onClick={() => {
                  action.action()
                  setIsOpen(false)
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <HelpIcon />
      </PopoverTrigger>
      <PopoverContent side={side} className="w-80">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Help</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <HelpContentComponent />
      </PopoverContent>
    </Popover>
  )
} 