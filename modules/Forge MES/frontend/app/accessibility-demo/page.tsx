"use client"

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { 
  AccessibleStatus, 
  TouchTarget, 
  HighContrastMode, 
  FactoryAccessibility, 
  FactoryAlert,
  SkipNavigation,
  factoryBreakpoints,
  FactoryAccessibilityContext
} from '@/components/ui/accessibility'
import { EquipmentStatus } from '@/components/ui/equipment-status'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle, CheckCircle, Info, AlertCircle, Settings, Monitor, Tablet } from 'lucide-react'

export default function AccessibilityDemo() {
  const [gloveMode, setGloveMode] = useState(false)
  const [highContrast, setHighContrast] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [fontSize, setFontSize] = useState<'small' | 'normal' | 'large'>('normal')
  const [showAlert, setShowAlert] = useState(true)

  const contextValue = {
    gloveMode,
    highContrast,
    soundEnabled,
    fontSize,
    setGloveMode,
    setHighContrast,
    setSoundEnabled,
    setFontSize
  }

  return (
    <FactoryAccessibilityContext.Provider value={contextValue}>
      <div className="min-h-screen bg-background">
        <SkipNavigation />
        
        <div className="container mx-auto p-6 space-y-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4">Factory Accessibility Features</h1>
            <p className="text-lg text-muted-foreground mb-6">
              Demonstrating WCAG 2.1 AA compliance and factory-specific accessibility features
            </p>
            
            {/* Accessibility Controls */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Accessibility Settings
                </CardTitle>
                <CardDescription>
                  Configure accessibility features for factory floor operations
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Switch checked={gloveMode} onCheckedChange={setGloveMode} />
                    Glove Mode
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Larger touch targets for workers wearing gloves
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Switch checked={highContrast} onCheckedChange={setHighContrast} />
                    High Contrast
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Enhanced visibility for bright factory environments
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
                    Sound Alerts
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Audio feedback for critical alerts
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>Font Size</Label>
                  <div className="flex gap-2">
                    {(['small', 'normal', 'large'] as const).map((size) => (
                      <Button
                        key={size}
                        variant={fontSize === size ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFontSize(size)}
                        className="capitalize"
                      >
                        {size}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <FactoryAccessibility gloveMode={gloveMode} highContrast={highContrast}>
            <HighContrastMode enabled={highContrast}>
              <main id="main-content" className="space-y-8">
                
                {/* Status Announcements Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>WCAG 2.1 AA Status Announcements</CardTitle>
                    <CardDescription>
                      Accessible status indicators with proper ARIA live regions
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <AccessibleStatus status="success" size="md">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          Production line operational
                        </div>
                      </AccessibleStatus>
                      
                      <AccessibleStatus status="warning" size="md">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          Quality check required
                        </div>
                      </AccessibleStatus>
                      
                      <AccessibleStatus status="error" size="md">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          Equipment maintenance needed
                        </div>
                      </AccessibleStatus>
                      
                      <AccessibleStatus status="info" size="md">
                        <div className="flex items-center gap-2">
                          <Info className="h-4 w-4" />
                          Batch completion: 87%
                        </div>
                      </AccessibleStatus>
                    </div>
                  </CardContent>
                </Card>

                {/* Touch Targets Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>Touch-Friendly Controls</CardTitle>
                    <CardDescription>
                      Optimized for workers wearing protective gloves
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center space-y-2">
                        <Label>Small (40px)</Label>
                        <TouchTarget size="sm" className="bg-blue-500 text-white rounded">
                          SM
                        </TouchTarget>
                      </div>
                      <div className="text-center space-y-2">
                        <Label>Medium (44px)</Label>
                        <TouchTarget size="md" className="bg-green-500 text-white rounded">
                          MD
                        </TouchTarget>
                      </div>
                      <div className="text-center space-y-2">
                        <Label>Large (56px)</Label>
                        <TouchTarget size="lg" className="bg-orange-500 text-white rounded">
                          LG
                        </TouchTarget>
                      </div>
                      <div className="text-center space-y-2">
                        <Label>Extra Large (64px)</Label>
                        <TouchTarget size="xl" className="bg-red-500 text-white rounded">
                          XL
                        </TouchTarget>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <h4 className="font-medium">Interactive Controls</h4>
                      <div className="flex flex-wrap gap-4">
                        <TouchTarget className="bg-primary text-primary-foreground rounded px-4">
                          Start Production
                        </TouchTarget>
                        <TouchTarget className="bg-destructive text-destructive-foreground rounded px-4">
                          Emergency Stop
                        </TouchTarget>
                        <TouchTarget className="bg-secondary text-secondary-foreground rounded px-4">
                          Pause Line
                        </TouchTarget>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Equipment Status Integration */}
                <Card>
                  <CardHeader>
                    <CardTitle>Equipment Status Indicators</CardTitle>
                    <CardDescription>
                      Accessible equipment monitoring with clear visual states
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>Mashing Line 01</Label>
                        <EquipmentStatus status="running" label="Mashing01" />
                      </div>
                      <div className="space-y-2">
                        <Label>Fermentation 01</Label>
                        <EquipmentStatus status="idle" label="Fermentation01" />
                      </div>
                      <div className="space-y-2">
                        <Label>Distillation 01</Label>
                        <EquipmentStatus status="maintenance" label="Distillation01" />
                      </div>
                      <div className="space-y-2">
                        <Label>Quality Control</Label>
                        <EquipmentStatus status="error" label="QualityControl" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Critical Alerts Section */}
                {showAlert && (
                  <FactoryAlert
                    level="warning"
                    title="Quality Check Required"
                    audioAlert={soundEnabled}
                    onDismiss={() => setShowAlert(false)}
                  >
                    <p>Batch #DWL-75-21-04-v01 requires quality inspection before proceeding to distillation.</p>
                    <p className="mt-2 font-medium">Action Required: Contact Quality Control Team</p>
                  </FactoryAlert>
                )}

                {/* Responsive Design Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>Responsive Factory Devices</CardTitle>
                    <CardDescription>
                      Optimized breakpoints for different factory hardware
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {Object.entries(factoryBreakpoints).map(([device, width]) => (
                        <div key={device} className="text-center p-4 border rounded-lg">
                          <div className="mb-2">
                            {device === 'tablet' && <Tablet className="h-8 w-8 mx-auto text-blue-500" />}
                            {device === 'monitor' && <Monitor className="h-8 w-8 mx-auto text-green-500" />}
                            {device === 'wall' && <Monitor className="h-8 w-8 mx-auto text-orange-500" />}
                            {device === 'control' && <Monitor className="h-8 w-8 mx-auto text-red-500" />}
                          </div>
                          <h4 className="font-medium capitalize">{device}</h4>
                          <p className="text-sm text-muted-foreground">{width}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Form Accessibility Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>Accessible Form Controls</CardTitle>
                    <CardDescription>
                      Production forms with proper labeling and validation
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="batch-id">Batch ID</Label>
                          <Input 
                            id="batch-id" 
                            placeholder="DWL-75-21-04-v01"
                            aria-describedby="batch-id-help"
                          />
                          <p id="batch-id-help" className="text-sm text-muted-foreground mt-1">
                            Enter the production batch identifier
                          </p>
                        </div>
                        
                        <div>
                          <Label htmlFor="temperature">Target Temperature (°F)</Label>
                          <div className="space-y-2">
                            <Slider
                              id="temperature"
                              min={150}
                              max={200}
                              step={5}
                              defaultValue={[180]}
                              className="w-full"
                            />
                            <p className="text-sm text-muted-foreground">
                              Current: 180°F (Recommended: 175-185°F)
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <Label>Production Status</Label>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge variant="default">In Progress</Badge>
                            <Badge variant="secondary">Quality Hold</Badge>
                            <Badge variant="outline">Awaiting Approval</Badge>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label>Quick Actions</Label>
                          <div className="flex flex-wrap gap-2">
                            <TouchTarget className="bg-green-600 text-white rounded px-3 py-1 text-sm">
                              Approve Batch
                            </TouchTarget>
                            <TouchTarget className="bg-yellow-600 text-white rounded px-3 py-1 text-sm">
                              Request QC
                            </TouchTarget>
                            <TouchTarget className="bg-red-600 text-white rounded px-3 py-1 text-sm">
                              Hold Production
                            </TouchTarget>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              </main>
            </HighContrastMode>
          </FactoryAccessibility>
        </div>
      </div>
    </FactoryAccessibilityContext.Provider>
  )
} 