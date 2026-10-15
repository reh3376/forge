'use client'

import { useState, useEffect } from 'react'
import { Keyboard, CheckCircle, AlertCircle, Loader2, Bug, Activity, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { KeyboardShortcutDisplay } from '@/components/ui/keyboard-shortcut-display'

interface KeyboardShortcutsDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function KeyboardShortcutsDialog({ 
  open: controlledOpen, 
  onOpenChange 
}: KeyboardShortcutsDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const { shortcutCategories, getShortcutString, isMac, isClient } = useKeyboardShortcuts()
  
  // Test functionality state
  const [lastTriggered, setLastTriggered] = useState<string | null>(null)
  const [triggeredShortcuts, setTriggeredShortcuts] = useState<Set<string>>(new Set())
  const [keyPressCount, setKeyPressCount] = useState(0)
  const [lastKeyPressed, setLastKeyPressed] = useState<string | null>(null)

  // Use controlled or internal state
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setIsOpen = onOpenChange || setInternalOpen

  // Listen for show shortcuts help event
  useEffect(() => {
    const handleShowShortcuts = () => {
      setIsOpen(true)
    }

    const handleCloseOverlays = () => {
      setIsOpen(false)
    }

    window.addEventListener('show-shortcuts-help', handleShowShortcuts)
    window.addEventListener('close-overlays', handleCloseOverlays)
    
    return () => {
      window.removeEventListener('show-shortcuts-help', handleShowShortcuts)
      window.removeEventListener('close-overlays', handleCloseOverlays)
    }
  }, [setIsOpen])

  // Listen for custom events to track shortcut usage (for test functionality)
  useEffect(() => {
    if (!isOpen) return // Only track when dialog is open

    const handleShortcutTriggered = (event: CustomEvent) => {
      const shortcutKey = event.detail?.shortcut || 'unknown'
      setLastTriggered(shortcutKey)
      setTriggeredShortcuts(prev => new Set([...prev, shortcutKey]))
    }

    // Listen for various shortcut events
    const events = [
      'toggle-sidebar',
      'open-command-palette', 
      'show-shortcuts-help',
      'close-overlays'
    ]

    events.forEach(eventName => {
      window.addEventListener(eventName, (e) => handleShortcutTriggered(e as CustomEvent))
    })

    // Add a global keydown listener to track any key presses
    const handleKeyDown = (event: KeyboardEvent) => {
      setKeyPressCount(prev => prev + 1)
      setLastKeyPressed(`${event.key} (${event.ctrlKey ? 'Ctrl+' : ''}${event.altKey ? 'Alt+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.metaKey ? 'Cmd+' : ''}${event.key})`)
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      events.forEach(eventName => {
        window.removeEventListener(eventName, (e) => handleShortcutTriggered(e as CustomEvent))
      })
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Reset test data when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setLastTriggered(null)
      setTriggeredShortcuts(new Set())
      setKeyPressCount(0)
      setLastKeyPressed(null)
    }
  }, [isOpen])

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="shortcuts" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
            <TabsTrigger value="shortcuts" className="flex items-center gap-2">
              <Keyboard className="h-4 w-4" />
              Shortcuts
            </TabsTrigger>
            <TabsTrigger value="test" className="flex items-center gap-2">
              <Bug className="h-4 w-4" />
              Test & Debug
            </TabsTrigger>
            <TabsTrigger value="status" className="flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              System Status
            </TabsTrigger>
          </TabsList>
          
          <div className="flex-1 overflow-hidden">
            <TabsContent value="shortcuts" className="h-full overflow-y-auto mt-4 space-y-6 pr-2">
              <p className="text-sm text-muted-foreground">
                Use these keyboard shortcuts to navigate quickly and efficiently throughout the application.
              </p>
              
              {shortcutCategories.map((category) => (
                <div key={category.name} className="space-y-3">
                  <h3 className="font-medium text-sm text-foreground border-b pb-1">
                    {category.name}
                  </h3>
                  
                  <div className="grid gap-2">
                    {category.shortcuts.map((shortcut, index) => (
                      <div 
                        key={index}
                        className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <span className="text-sm text-foreground">
                          {shortcut.description}
                        </span>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {getShortcutString(shortcut)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Press Escape to close this dialog</span>
                  <span>Shortcuts work globally except when typing in inputs</span>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="test" className="h-full overflow-y-auto mt-4 space-y-4 pr-2">
              {/* Loading State */}
              {!isClient && (
                <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-yellow-600" />
                      <span className="font-medium">Initializing keyboard shortcuts...</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Ready State */}
              {isClient && (
                <Card className="border-green-200 bg-green-50 dark:bg-green-950">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="font-medium">Keyboard shortcuts are active!</span>
                      <Badge variant="outline">
                        {shortcutCategories.reduce((total, cat) => total + cat.shortcuts.length, 0)} shortcuts loaded
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Key Press Tracking */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Key Press Detection
                  </CardTitle>
                  <CardDescription>
                    This shows if the browser is detecting your key presses
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Total Key Presses:</span>
                      <Badge variant="outline">{keyPressCount}</Badge>
                    </div>
                    {lastKeyPressed && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Last Key:</span>
                        <Badge variant="secondary">{lastKeyPressed}</Badge>
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Try pressing any key to test detection. Then try the keyboard shortcuts.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Last Triggered */}
              {lastTriggered && (
                <Card className="border-green-200 bg-green-50 dark:bg-green-950">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="font-medium">Last triggered:</span>
                      <Badge variant="default">{lastTriggered}</Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Debug Instructions */}
              <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Debug Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <p>
                      <strong>Open your browser&apos;s developer console</strong> to see detailed keyboard event logging.
                    </p>
                    <p>
                      When you press any key, you&apos;ll see debug information including which modifiers are pressed
                      and whether a shortcut was found and executed.
                    </p>
                    <p className="text-muted-foreground">
                      Press F12 or right-click → Inspect → Console tab to view the logs.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Testing Instructions */}
              <Card>
                <CardHeader>
                  <CardTitle>Testing Instructions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <p><strong>1. Navigation Shortcuts:</strong> Use Alt + Shift + letter combinations to navigate between pages.</p>
                    <p><strong>2. Layout Shortcuts:</strong> Use {isMac ? '⌘' : 'Ctrl'} + Shift + B to toggle the sidebar.</p>
                    <p><strong>3. Help Shortcuts:</strong> Press Shift + ? to show this dialog.</p>
                    <p><strong>4. General:</strong> Press Escape to close modals and overlays.</p>
                    <p className="text-muted-foreground">
                      Shortcuts that have been successfully triggered will be highlighted in green below.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Shortcut Categories for Testing */}
              {isClient && (
                <div className="space-y-4">
                  <h3 className="font-medium text-lg">Test Shortcuts</h3>
                  {shortcutCategories.map((category) => (
                    <Card key={category.name}>
                      <CardHeader>
                        <CardTitle className="text-base">{category.name}</CardTitle>
                        <CardDescription>
                          Try these keyboard shortcuts to test functionality
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {category.shortcuts.map((shortcut, index) => {
                            const hasBeenTriggered = triggeredShortcuts.has(shortcut.description)
                            
                            return (
                              <div 
                                key={index}
                                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                                  hasBeenTriggered 
                                    ? 'border-green-200 bg-green-50 dark:bg-green-950' 
                                    : 'border-border bg-muted/50'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  {hasBeenTriggered && (
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  )}
                                  <span className="font-medium">{shortcut.description}</span>
                                </div>
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
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="status" className="h-full overflow-y-auto mt-4 space-y-4 pr-2">
              {/* Platform Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Monitor className="h-5 w-5" />
                    Platform Detection
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Client Ready:</span>
                      <Badge variant={isClient ? 'default' : 'secondary'}>
                        {isClient ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Platform:</span>
                      <Badge variant={isMac ? 'default' : 'secondary'}>
                        {isMac ? 'macOS' : 'Windows/Linux'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Primary Modifier:</span>
                      <Badge variant="outline">
                        {isMac ? '⌘ (Cmd)' : 'Ctrl'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">User Agent:</span>
                      <span className="text-sm text-muted-foreground font-mono break-all">
                        {typeof window !== 'undefined' ? navigator.userAgent.slice(0, 100) + '...' : 'N/A'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* System Information */}
              <Card>
                <CardHeader>
                  <CardTitle>System Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Shortcuts Loaded:</span>
                      <Badge variant="outline">
                        {shortcutCategories.reduce((total, cat) => total + cat.shortcuts.length, 0)}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Categories:</span>
                      <Badge variant="outline">{shortcutCategories.length}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Browser Support:</span>
                      <Badge variant="default">Full</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Troubleshooting */}
              <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Troubleshooting
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                                         <p><strong>If shortcuts aren&apos;t working:</strong></p>
                     <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                       <li>Make sure you&apos;re not typing in an input field</li>
                      <li>Check if browser extensions are intercepting keys</li>
                      <li>On macOS, some system shortcuts may override app shortcuts</li>
                      <li>Try refreshing the page if shortcuts stop working</li>
                      <li>Check the browser console for error messages</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// Trigger button component
export function KeyboardShortcutsTrigger() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 w-8 p-0"
        title="Keyboard Shortcuts (Shift + ?)"
      >
        <Keyboard className="h-4 w-4" />
      </Button>
      
      <KeyboardShortcutsDialog open={open} onOpenChange={setOpen} />
    </>
  )
} 