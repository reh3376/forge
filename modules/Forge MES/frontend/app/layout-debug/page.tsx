'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useLayout } from '@/hooks/use-layout'
import { useSidebar } from '@/hooks/use-sidebar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useEffect, useState } from 'react'
import { LayoutType } from '@/lib/layout'

export default function LayoutDebugPage() {
  const layout = useLayout()
  const sidebar = useSidebar()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleLayoutChange = (layoutType: LayoutType) => {
    console.log('🔄 Layout change requested:', layoutType)
    layout.setLayout(layoutType)
    
    // Force a re-render by updating local storage
    window.dispatchEvent(new Event('storage'))
  }

  if (!mounted) {
    return <div>Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Layout Debug Page</h1>
        <p className="text-muted-foreground">
          Real-time layout state monitoring and testing
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Layout State */}
        <Card>
          <CardHeader>
            <CardTitle>Layout State</CardTitle>
            <CardDescription>Current layout configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium">Current Layout:</span>
                <Badge variant="default">{layout.currentLayout}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Layout Name:</span>
                <span>{layout.currentConfig.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Should Show Sidebar:</span>
                <Badge variant={layout.shouldShowSidebar ? "default" : "secondary"}>
                  {layout.shouldShowSidebar ? 'Yes' : 'No'}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Sidebar Position:</span>
                <span>{layout.currentConfig.sidebarPosition || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Content Width:</span>
                <span>{layout.currentConfig.contentWidth}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Split View:</span>
                <Badge variant={layout.currentConfig.splitView ? "default" : "secondary"}>
                  {layout.currentConfig.splitView ? 'Yes' : 'No'}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Layout Loading:</span>
                <Badge variant={layout.isLoading ? "destructive" : "default"}>
                  {layout.isLoading ? 'Loading' : 'Ready'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sidebar State */}
        <Card>
          <CardHeader>
            <CardTitle>Sidebar State</CardTitle>
            <CardDescription>Current sidebar configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium">Is Open:</span>
                <Badge variant={sidebar.isOpen ? "default" : "secondary"}>
                  {sidebar.isOpen ? 'Open' : 'Closed'}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Is Loaded:</span>
                <Badge variant={sidebar.isLoaded ? "default" : "destructive"}>
                  {sidebar.isLoaded ? 'Loaded' : 'Loading'}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Sidebar Collapsed:</span>
                <Badge variant={layout.preferences.sidebarCollapsed ? "destructive" : "default"}>
                  {layout.preferences.sidebarCollapsed ? 'Collapsed' : 'Expanded'}
                </Badge>
              </div>
            </div>

            <div className="pt-4 space-y-2">
              <Button 
                onClick={() => sidebar.toggle()} 
                variant="outline" 
                className="w-full"
              >
                Toggle Sidebar
              </Button>
              <Button 
                onClick={() => layout.toggleSidebar()} 
                variant="outline" 
                className="w-full"
              >
                Toggle Sidebar Collapsed
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Layout Switcher */}
      <Card>
        <CardHeader>
          <CardTitle>Layout Switcher</CardTitle>
          <CardDescription>
            Click to switch between different layouts. Watch the state changes above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button
              onClick={() => handleLayoutChange('sidebar-left')}
              variant={layout.currentLayout === 'sidebar-left' ? 'default' : 'outline'}
              className="w-full"
            >
              <div className="text-center">
                <div>Sidebar Left</div>
                <div className="text-xs opacity-70">Traditional</div>
              </div>
            </Button>
            
            <Button
              onClick={() => handleLayoutChange('sidebar-right')}
              variant={layout.currentLayout === 'sidebar-right' ? 'default' : 'outline'}
              className="w-full"
            >
              <div className="text-center">
                <div>Sidebar Right</div>
                <div className="text-xs opacity-70">Right-aligned</div>
              </div>
            </Button>
            
            <Button
              onClick={() => handleLayoutChange('full-width')}
              variant={layout.currentLayout === 'full-width' ? 'default' : 'outline'}
              className="w-full"
            >
              <div className="text-center">
                <div>Full Width</div>
                <div className="text-xs opacity-70">No sidebar</div>
              </div>
            </Button>
            
            <Button
              onClick={() => handleLayoutChange('split-view')}
              variant={layout.currentLayout === 'split-view' ? 'default' : 'outline'}
              className="w-full"
            >
              <div className="text-center">
                <div>Split View</div>
                <div className="text-xs opacity-70">Dual pane</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Raw State */}
      <Card>
        <CardHeader>
          <CardTitle>Raw State Data</CardTitle>
          <CardDescription>Complete state objects for debugging</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Layout Preferences:</h4>
              <pre className="p-3 bg-muted rounded-md text-xs overflow-auto">
                {JSON.stringify(layout.preferences, null, 2)}
              </pre>
            </div>
            <div>
              <h4 className="font-medium mb-2">Current Config:</h4>
              <pre className="p-3 bg-muted rounded-md text-xs overflow-auto">
                {JSON.stringify(layout.currentConfig, null, 2)}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visual Indicator */}
      <Card className="border-2 border-primary">
        <CardHeader>
          <CardTitle>Visual Layout Indicator</CardTitle>
          <CardDescription>
            This box should change based on the current layout
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className={`p-8 rounded-lg text-center transition-all duration-300 ${
            layout.currentLayout === 'sidebar-left' ? 'bg-blue-100 dark:bg-blue-900' :
            layout.currentLayout === 'sidebar-right' ? 'bg-green-100 dark:bg-green-900' :
            layout.currentLayout === 'full-width' ? 'bg-purple-100 dark:bg-purple-900' :
            layout.currentLayout === 'split-view' ? 'bg-orange-100 dark:bg-orange-900' :
            'bg-gray-100 dark:bg-gray-900'
          }`}>
            <div className="text-2xl font-bold mb-2">
              {layout.currentConfig.name}
            </div>
            <div className="text-sm opacity-70">
              {layout.currentConfig.description}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 