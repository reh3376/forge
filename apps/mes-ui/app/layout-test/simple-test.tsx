'use client'

import { useLayout } from '@/hooks/use-layout'
import { Button } from '@/components/ui/button'

export function SimpleLayoutTest() {
  const { currentLayout, setLayout, isLoading } = useLayout()
  
  return (
    <div className="p-4 border rounded">
      <h3 className="font-bold mb-2">Simple Layout Test</h3>
      <p className="mb-2">Current: {currentLayout} {isLoading && '(loading...)'}</p>
      <div className="flex gap-2">
        <Button 
          size="sm" 
          onClick={() => setLayout('sidebar-left')}
          variant={currentLayout === 'sidebar-left' ? 'default' : 'outline'}
        >
          Left
        </Button>
        <Button 
          size="sm" 
          onClick={() => setLayout('sidebar-right')}
          variant={currentLayout === 'sidebar-right' ? 'default' : 'outline'}
        >
          Right
        </Button>
        <Button 
          size="sm" 
          onClick={() => setLayout('full-width')}
          variant={currentLayout === 'full-width' ? 'default' : 'outline'}
        >
          Full
        </Button>
        <Button 
          size="sm" 
          onClick={() => setLayout('split-view')}
          variant={currentLayout === 'split-view' ? 'default' : 'outline'}
        >
          Split
        </Button>
      </div>
    </div>
  )
} 