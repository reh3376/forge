'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { KeyboardShortcutDisplay } from '@/components/ui/keyboard-shortcut-display'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { PageContainer } from '@/components/ui/layout'
import { Keyboard, CheckCircle, AlertCircle, Loader2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function KeyboardTestPage() {
  const { shortcutCategories, isMac, isClient } = useKeyboardShortcuts()
  const [lastTriggered, setLastTriggered] = useState<string | null>(null)
  const [triggeredShortcuts, setTriggeredShortcuts] = useState<string[]>([])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const keyCombo = `${event.shiftKey ? 'Shift+' : ''}${event.ctrlKey ? 'Ctrl+' : ''}${event.altKey ? 'Alt+' : ''}${event.metaKey ? 'Cmd+' : ''}${event.key}`
      setLastTriggered(keyCombo)
      
      // Add to triggered shortcuts list (keep last 10)
      setTriggeredShortcuts(prev => [keyCombo, ...prev.slice(0, 9)])
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const totalShortcuts = shortcutCategories.reduce((total, category) => total + category.shortcuts.length, 0)

  return (
    <PageContainer className="max-w-4xl mx-auto">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Keyboard Shortcuts Test</h1>
            <p className="text-muted-foreground">
              Test and debug keyboard shortcuts functionality
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </div>

        {/* Status Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Client Status</CardTitle>
              {isClient ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-yellow-600" />
              )}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isClient ? 'Ready' : 'Loading...'}
              </div>
              <p className="text-xs text-muted-foreground">
                {isClient ? 'Client-side JavaScript loaded' : 'Initializing...'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Platform</CardTitle>
              <Keyboard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isClient ? (isMac ? 'macOS' : 'Windows/Linux') : 'Detecting...'}
              </div>
              <p className="text-xs text-muted-foreground">
                {isClient ? 'Platform detected' : 'Checking platform...'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Shortcuts</CardTitle>
              {totalShortcuts > 0 ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-yellow-600" />
              )}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalShortcuts}</div>
              <p className="text-xs text-muted-foreground">
                {totalShortcuts > 0 ? 'Shortcuts loaded' : 'No shortcuts loaded'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Key Press Monitor */}
        <Card>
          <CardHeader>
            <CardTitle>Key Press Monitor</CardTitle>
            <CardDescription>
              Press any key combination to see it detected here
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Last Key Pressed:</label>
                <div className="mt-1 p-3 bg-muted rounded-md font-mono text-sm">
                  {lastTriggered || 'Press any key...'}
                </div>
              </div>
              
              {triggeredShortcuts.length > 0 && (
                <div>
                  <label className="text-sm font-medium">Recent Key Presses:</label>
                  <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                    {triggeredShortcuts.map((shortcut, index) => (
                      <div key={index} className="p-2 bg-muted rounded text-sm font-mono">
                        {shortcut}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Shortcuts List */}
        {totalShortcuts > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Available Shortcuts</CardTitle>
              <CardDescription>
                All keyboard shortcuts currently registered in the application
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6 max-h-96 overflow-y-auto">
                {shortcutCategories.map((category) => (
                  <div key={category.name}>
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                      {category.name}
                    </h3>
                    <div className="space-y-2">
                      {category.shortcuts.map((shortcut, index) => (
                        <div key={index} className="flex items-center justify-between p-2 rounded-md border">
                          <span className="text-sm">{shortcut.description}</span>
                          <KeyboardShortcutDisplay 
                            keys={{
                              ctrl: shortcut.ctrlKey || false,
                              alt: shortcut.altKey || false,
                              shift: shortcut.shiftKey || false,
                              meta: shortcut.metaKey || false,
                              key: shortcut.key
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Testing Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p><strong>To test keyboard shortcuts:</strong></p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Make sure this page has focus (click anywhere on the page)</li>
                <li>Try pressing the keyboard shortcuts listed above</li>
                <li>Watch the "Key Press Monitor" to see if keys are being detected</li>
                <li>Check the browser console for detailed debug information</li>
                <li>Use the main keyboard shortcuts dialog (Shift + ?) for a better experience</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
} 