'use client'

import React from 'react'
import { ManufacturingRole } from '@/lib/auth-config'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Settings, 
  User, 
  LogIn,
  LogOut 
} from 'lucide-react'

interface DevAuthControlsProps {
  isVisible: boolean
  currentRole: ManufacturingRole | null
  onRoleChange: (role: ManufacturingRole | null) => void
  onToggleAuth: (authenticated: boolean) => void
  isAuthenticated: boolean
}

export function DevAuthControls({
  isVisible,
  currentRole,
  onRoleChange,
  onToggleAuth,
  isAuthenticated
}: DevAuthControlsProps) {
  if (!isVisible || process.env.NODE_ENV === 'production') {
    return null
  }

  const roleOptions: { label: string; value: ManufacturingRole; description: string }[] = [
    {
      label: 'ET Admin',
      value: ManufacturingRole.ET_ADMIN,
      description: 'Full system administration and technical oversight'
    },
    {
      label: 'ET Controls',
      value: ManufacturingRole.ET_CONTROLS,
      description: 'Controls engineering and system configuration'
    },
    {
      label: 'ET Developer',
      value: ManufacturingRole.ET_DEVELOPER,
      description: 'Development and system integration'
    },
    {
      label: 'Distillery Leadership',
      value: ManufacturingRole.OPS_DISTILLERY_LEADERSHIP,
      description: 'Operations leadership and approval authority'
    },
    {
      label: 'Distillery Supervisor',
      value: ManufacturingRole.OPS_DISTILLERY_SUPERVISOR,
      description: 'Operations supervision and management'
    },
    {
      label: 'Distillery Shift Lead',
      value: ManufacturingRole.OPS_DISTILLERY_SHIFTLEAD,
      description: 'Shift leadership and quality oversight'
    },
    {
      label: 'Distillery Operator',
      value: ManufacturingRole.OPS_DISTILLERY_OPERATOR,
      description: 'Basic operations and data entry'
    },
    {
      label: 'Maintenance Leadership',
      value: ManufacturingRole.MAINTENANCE_LEADERSHIP,
      description: 'Maintenance leadership and scheduling'
    },
    {
      label: 'Maintenance Technician',
      value: ManufacturingRole.MAINTENANCE_TECHNICIAN,
      description: 'Maintenance execution and equipment service'
    }
  ]

  return (
    <Card className="fixed bottom-4 right-4 w-80 z-50 border-dashed border-yellow-400 bg-yellow-50 dark:bg-yellow-950">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Dev Auth Controls
        </CardTitle>
        <CardDescription className="text-xs">
          Development only - simulates Microsoft Entra ID authentication
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Authentication Toggle */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Authentication Status</span>
          <Button
            size="sm"
            variant={isAuthenticated ? "destructive" : "default"}
            onClick={() => onToggleAuth(!isAuthenticated)}
            className="h-8"
          >
            {isAuthenticated ? (
              <>
                <LogOut className="h-3 w-3 mr-1" />
                Sign Out
              </>
            ) : (
              <>
                <LogIn className="h-3 w-3 mr-1" />
                Sign In
              </>
            )}
          </Button>
        </div>

        {isAuthenticated && (
          <>
            {/* Current Role Display */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Current Role</span>
              <div>
                {currentRole ? (
                  <Badge variant="default" className="text-xs">
                    {roleOptions.find(r => r.value === currentRole)?.label || currentRole}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    No Role
                  </Badge>
                )}
              </div>
            </div>

            {/* Role Selection */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Switch Role</span>
              <div className="grid grid-cols-1 gap-1">
                {roleOptions.map(({ value, label, description }) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={currentRole === value ? "default" : "ghost"}
                    onClick={() => onRoleChange(value)}
                    className="justify-start h-auto p-2 text-xs"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <div className="text-left">
                        <div className="font-medium">{label}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {description}
                        </div>
                      </div>
                    </div>
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant={currentRole === null ? "default" : "ghost"}
                  onClick={() => onRoleChange(null)}
                  className="justify-start h-8 text-xs"
                >
                  <User className="h-3 w-3 mr-2" />
                  Clear Role
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Instructions */}
        <div className="text-xs text-muted-foreground bg-white dark:bg-gray-800 p-2 rounded border-l-2 border-yellow-400">
          <p className="font-medium mb-1">Instructions:</p>
          <ul className="space-y-1 text-xs">
            <li>• Toggle authentication on/off</li>
            <li>• Switch between manufacturing roles</li>
            <li>• Test route protection and permissions</li>
            <li>• Hidden in production builds</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

// Hook to show/hide dev controls with keyboard shortcut
export function useDevAuthControls() {
  const [isVisible, setIsVisible] = React.useState(false)

  React.useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Use Cmd+Shift+D on Mac, Ctrl+Shift+D on others
      const isMac = typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modifierKey = isMac ? event.metaKey : event.ctrlKey
      
      if (modifierKey && event.shiftKey && event.key === 'D') {
        event.preventDefault()
        setIsVisible(prev => !prev)
      }
      
      // Escape to hide
      if (event.key === 'Escape' && isVisible) {
        setIsVisible(false)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isVisible])

  return { isVisible, setIsVisible }
} 