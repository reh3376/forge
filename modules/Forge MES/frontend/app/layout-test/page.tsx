'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useLayout } from '@/hooks/use-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IconLayoutSelector } from '@/components/layout/layout-selector'
import { SimpleLayoutTest } from './simple-test'

export default function LayoutTestPage() {
  const { 
    currentLayout, 
    currentConfig, 
    preferences,
    shouldShowSidebar,
    setLayout,
    toggleSidebar,
    isLoading 
  } = useLayout()

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Layout Test Page</h1>
      
      {/* Simple Test Component */}
      <div className="mb-6">
        <SimpleLayoutTest />
      </div>
      
      {/* Visual Layout Indicator */}
      <div className="mb-6 p-4 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-2">Current Layout:</p>
          <p className="text-2xl font-bold text-primary">{currentConfig.name}</p>
          <p className="text-sm text-muted-foreground mt-2">
            {currentConfig.description}
          </p>
        </div>
      </div>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Current Layout State</CardTitle>
          <CardDescription>Debug information about the current layout</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p><strong>Current Layout:</strong> {currentLayout}</p>
            <p><strong>Layout Name:</strong> {currentConfig.name}</p>
            <p><strong>Should Show Sidebar:</strong> {shouldShowSidebar ? 'Yes' : 'No'}</p>
            <p><strong>Sidebar Position:</strong> {currentConfig.sidebarPosition || 'N/A'}</p>
            <p><strong>Content Width:</strong> {currentConfig.contentWidth}</p>
            <p><strong>Split View:</strong> {currentConfig.splitView ? 'Yes' : 'No'}</p>
            <p><strong>Is Loading:</strong> {isLoading ? 'Yes' : 'No'}</p>
            <p><strong>Sidebar Collapsed:</strong> {preferences.sidebarCollapsed ? 'Yes' : 'No'}</p>
          </div>
          
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">
              <strong>Full Preferences:</strong>
            </p>
            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
              {JSON.stringify(preferences, null, 2)}
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Debug Test</CardTitle>
          <CardDescription>Test layout switching with detailed logging</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => {
              console.log('=== LAYOUT TEST START ===')
              console.log('Current state:', {
                currentLayout,
                currentConfig,
                preferences,
                shouldShowSidebar,
                isLoading
              })
              
              const newLayout = currentLayout === 'sidebar-left' ? 'sidebar-right' : 'sidebar-left'
              console.log(`Attempting to switch from ${currentLayout} to ${newLayout}`)
              
              setLayout(newLayout)
              
              // Check state after a short delay
              setTimeout(() => {
                console.log('State after setLayout:', {
                  currentLayout,
                  localStorage: localStorage.getItem('workspace-layout-preferences')
                })
                console.log('=== LAYOUT TEST END ===')
              }, 100)
            }}
            variant="default"
            className="w-full"
          >
            Test Layout Switch (Check Console)
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Layout Switcher - Buttons</CardTitle>
          <CardDescription>Click buttons to test layout switching</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Button
              onClick={() => {
                console.log('Switching to sidebar-left')
                setLayout('sidebar-left')
              }}
              variant={currentLayout === 'sidebar-left' ? 'default' : 'outline'}
            >
              Sidebar Left
            </Button>
            
            <Button
              onClick={() => {
                console.log('Switching to sidebar-right')
                setLayout('sidebar-right')
              }}
              variant={currentLayout === 'sidebar-right' ? 'default' : 'outline'}
            >
              Sidebar Right
            </Button>
            
            <Button
              onClick={() => {
                console.log('Switching to full-width')
                setLayout('full-width')
              }}
              variant={currentLayout === 'full-width' ? 'default' : 'outline'}
            >
              Full Width
            </Button>
            
            <Button
              onClick={() => {
                console.log('Switching to split-view')
                setLayout('split-view')
              }}
              variant={currentLayout === 'split-view' ? 'default' : 'outline'}
            >
              Split View
            </Button>
          </div>
          
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">
              Check the console for layout change logs
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Layout Switcher - Icons</CardTitle>
          <CardDescription>Alternative icon-based layout switcher</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center">
            <IconLayoutSelector />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sidebar Controls</CardTitle>
          <CardDescription>Test sidebar toggle functionality</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Button
              onClick={toggleSidebar}
              variant="outline"
              className="w-full"
              disabled={!shouldShowSidebar}
            >
              {preferences.sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            </Button>
            {!shouldShowSidebar && (
              <p className="text-sm text-muted-foreground text-center">
                Sidebar is not available in {currentConfig.name} layout
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Visual Layout Examples */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Layout Visual Examples</CardTitle>
          <CardDescription>Visual representation of each layout</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {/* Sidebar Left */}
            <div className="border rounded p-4">
              <p className="text-sm font-medium mb-2">Sidebar Left</p>
              <div className="flex h-20 gap-2">
                <div className="w-1/4 bg-primary/20 rounded"></div>
                <div className="flex-1 bg-muted rounded"></div>
              </div>
            </div>
            
            {/* Sidebar Right */}
            <div className="border rounded p-4">
              <p className="text-sm font-medium mb-2">Sidebar Right</p>
              <div className="flex h-20 gap-2">
                <div className="flex-1 bg-muted rounded"></div>
                <div className="w-1/4 bg-primary/20 rounded"></div>
              </div>
            </div>
            
            {/* Full Width */}
            <div className="border rounded p-4">
              <p className="text-sm font-medium mb-2">Full Width</p>
              <div className="flex h-20">
                <div className="flex-1 bg-muted rounded"></div>
              </div>
            </div>
            
            {/* Split View */}
            <div className="border rounded p-4">
              <p className="text-sm font-medium mb-2">Split View</p>
              <div className="flex h-20 gap-2">
                <div className="w-1/6 bg-primary/20 rounded"></div>
                <div className="flex-1 bg-muted rounded"></div>
                <div className="flex-1 bg-muted/50 rounded"></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 