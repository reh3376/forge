'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { ManufacturingRole, ManufacturingPermission } from '@/lib/auth-config'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Shield, 
  Lock, 
  AlertCircle, 
  ArrowLeft, 
  Home,
  RefreshCw
} from 'lucide-react'
import { storeRedirectIntent } from '@/lib/auth-redirect'

// Route protection configuration
export interface RouteProtectionConfig {
  requiresAuth?: boolean
  allowedRoles?: ManufacturingRole[]
  requiredPermissions?: ManufacturingPermission[]
  requireAllPermissions?: boolean
  redirectTo?: string
  fallbackComponent?: React.ComponentType<Record<string, unknown>>
}

// Access denial reasons
export enum AccessDenialReason {
  NOT_AUTHENTICATED = 'not_authenticated',
  INSUFFICIENT_ROLE = 'insufficient_role',
  MISSING_PERMISSIONS = 'missing_permissions',
  ROUTE_NOT_CONFIGURED = 'route_not_configured'
}

// Route access result
export interface RouteAccessResult {
  hasAccess: boolean
  reason?: AccessDenialReason
  missingRoles?: ManufacturingRole[]
  missingPermissions?: ManufacturingPermission[]
  redirectTo?: string
}

// Props for route guard component
interface RouteGuardProps {
  children: React.ReactNode
  config: RouteProtectionConfig
  loading?: React.ReactNode
  fallback?: React.ReactNode
}

// Props for access denied component
interface AccessDeniedProps {
  reason: AccessDenialReason
  missingRoles?: ManufacturingRole[]
  missingPermissions?: ManufacturingPermission[]
  currentPath?: string
  onRetry?: () => void
}

/**
 * Access Denied Component
 * Displays appropriate error messages based on denial reason
 */
export function AccessDenied({ 
  reason, 
  missingRoles = [], 
  missingPermissions = [], 
  currentPath,
  onRetry 
}: AccessDeniedProps) {
  const router = useRouter()
  const { login } = useAuth()

  const handleLogin = async () => {
    try {
      // Store the current path for post-login redirect
      if (currentPath && currentPath !== '/' && currentPath !== '/dashboard') {
        storeRedirectIntent(currentPath)
      }
      await login()
    } catch (error) {
      console.error('Login failed:', error)
    }
  }

  const handleGoHome = () => {
    router.push('/')
  }

  const handleGoBack = () => {
    router.back()
  }

  const renderContent = () => {
    switch (reason) {
      case AccessDenialReason.NOT_AUTHENTICATED:
        return (
          <Card className="w-full max-w-md mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <Lock className="h-6 w-6" />
                Authentication Required
              </CardTitle>
              <CardDescription>
                You must be signed in to access this page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center text-sm text-muted-foreground">
                Requested path: <code className="bg-muted px-1 rounded">{currentPath}</code>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleLogin} className="flex-1">
                  <Shield className="h-4 w-4 mr-2" />
                  Sign In
                </Button>
                <Button variant="outline" onClick={handleGoHome}>
                  <Home className="h-4 w-4 mr-2" />
                  Home
                </Button>
              </div>
            </CardContent>
          </Card>
        )

      case AccessDenialReason.INSUFFICIENT_ROLE:
        return (
          <Card className="w-full max-w-md mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <AlertCircle className="h-6 w-6 text-orange-600" />
                Insufficient Role
              </CardTitle>
              <CardDescription>
                Your current role doesn&apos;t have access to this page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {missingRoles.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Required roles:</p>
                  <div className="flex flex-wrap gap-1">
                    {missingRoles.map((role) => (
                      <Badge key={role} variant="outline">
                        {role}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-center text-sm text-muted-foreground">
                Contact your supervisor or system administrator for access
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleGoBack} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go Back
                </Button>
                <Button variant="outline" onClick={handleGoHome}>
                  <Home className="h-4 w-4 mr-2" />
                  Home
                </Button>
              </div>
            </CardContent>
          </Card>
        )

      case AccessDenialReason.MISSING_PERMISSIONS:
        return (
          <Card className="w-full max-w-md mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <AlertCircle className="h-6 w-6 text-red-600" />
                Access Denied
              </CardTitle>
              <CardDescription>
                You don&apos;t have the required permissions for this page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {missingPermissions.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Missing permissions:</p>
                  <div className="flex flex-wrap gap-1">
                    {missingPermissions.map((permission) => (
                      <Badge key={permission} variant="outline" className="text-xs">
                        {permission.replace(/_/g, ' ').toLowerCase()}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-center text-sm text-muted-foreground">
                Contact your supervisor or system administrator for access
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleGoBack} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go Back
                </Button>
                <Button variant="outline" onClick={handleGoHome}>
                  <Home className="h-4 w-4 mr-2" />
                  Home
                </Button>
              </div>
            </CardContent>
          </Card>
        )

      default:
        return (
          <Card className="w-full max-w-md mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <AlertCircle className="h-6 w-6 text-gray-600" />
                Access Error
              </CardTitle>
              <CardDescription>
                Unable to determine access permissions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center text-sm text-muted-foreground">
                Please try again or contact support
              </div>
              <div className="flex gap-2">
                {onRetry && (
                  <Button variant="outline" onClick={onRetry} className="flex-1">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                )}
                <Button variant="outline" onClick={handleGoHome}>
                  <Home className="h-4 w-4 mr-2" />
                  Home
                </Button>
              </div>
            </CardContent>
          </Card>
        )
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {renderContent()}
    </div>
  )
}

/**
 * Route Access Checker
 * Evaluates whether a user can access a route based on configuration
 */
export class RouteAccessChecker {
  static checkAccess(
    config: RouteProtectionConfig,
    isAuthenticated: boolean,
    userRoles: ManufacturingRole[],
    hasPermission: (permission: ManufacturingPermission) => boolean,
    hasAnyRole: (roles: ManufacturingRole[]) => boolean,
    validateAccess: (permissions: ManufacturingPermission[], requireAll?: boolean) => { hasAccess: boolean; missingPermissions: ManufacturingPermission[] }
  ): RouteAccessResult {
    // Check authentication requirement
    if (config.requiresAuth !== false && !isAuthenticated) {
      return {
        hasAccess: false,
        reason: AccessDenialReason.NOT_AUTHENTICATED,
        redirectTo: config.redirectTo || '/'
      }
    }

    // If authenticated is not required and user is not authenticated, allow access
    if (config.requiresAuth === false) {
      return { hasAccess: true }
    }

    // Check role requirements
    if (config.allowedRoles && config.allowedRoles.length > 0) {
      if (!hasAnyRole(config.allowedRoles)) {
        return {
          hasAccess: false,
          reason: AccessDenialReason.INSUFFICIENT_ROLE,
          missingRoles: config.allowedRoles.filter(role => !userRoles.includes(role)),
          redirectTo: config.redirectTo || '/'
        }
      }
    }

    // Check permission requirements
    if (config.requiredPermissions && config.requiredPermissions.length > 0) {
      const accessResult = validateAccess(
        config.requiredPermissions, 
        config.requireAllPermissions || false
      )
      
      if (!accessResult.hasAccess) {
        return {
          hasAccess: false,
          reason: AccessDenialReason.MISSING_PERMISSIONS,
          missingPermissions: accessResult.missingPermissions,
          redirectTo: config.redirectTo || '/'
        }
      }
    }

    return { hasAccess: true }
  }
}

/**
 * Route Guard Component
 * Protects routes based on authentication, roles, and permissions
 */
export function RouteGuard({ children, config, loading, fallback }: RouteGuardProps) {
  const { 
    isAuthenticated, 
    isLoading, 
    user, 
    hasAnyRole, 
    validateAccess 
  } = useAuth()
  const pathname = usePathname()
  const [accessResult, setAccessResult] = useState<RouteAccessResult | null>(null)
  const [isChecking, setIsChecking] = useState(true)

  // Check access whenever auth state or route changes
  useEffect(() => {
    const checkRouteAccess = () => {
      setIsChecking(true)
      
      // If still loading auth state, wait
      if (isLoading) {
        return
      }

      const hasPermission = (permission: ManufacturingPermission): boolean => {
        return user?.permissions.includes(permission) || false
      }

      const result = RouteAccessChecker.checkAccess(
        config,
        isAuthenticated,
        user?.roles || [],
        hasPermission,
        hasAnyRole,
        validateAccess
      )

      setAccessResult(result)
      setIsChecking(false)

      // Note: Removed automatic redirect logic - we now always show AccessDenied component
      // This provides a better UX with the login card instead of redirecting away
    }

    checkRouteAccess()
  }, [isAuthenticated, isLoading, user, config, pathname, hasAnyRole, validateAccess])

  // Show loading state
  if (isLoading || isChecking) {
    return loading || (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">Checking access permissions...</p>
        </div>
      </div>
    )
  }

  // Show access denied if no access - always show the AccessDenied component instead of redirecting
  if (!accessResult?.hasAccess && accessResult) {
    return fallback || (
      <AccessDenied
        reason={accessResult.reason!}
        missingRoles={accessResult.missingRoles || []}
        missingPermissions={accessResult.missingPermissions || []}
        currentPath={pathname}
        onRetry={() => window.location.reload()}
      />
    )
  }

  // Render protected content
  return <>{children}</>
}

/**
 * Higher-order component for protecting pages
 */
export function withRouteGuard<P extends object>(
  Component: React.ComponentType<P>,
  config: RouteProtectionConfig
) {
  return function ProtectedComponent(props: P) {
    return (
      <RouteGuard config={config}>
        <Component {...props} />
      </RouteGuard>
    )
  }
}

/**
 * Hook for route protection in functional components
 */
export function useRouteProtection(config: RouteProtectionConfig): {
  hasAccess: boolean
  isChecking: boolean
  accessResult: RouteAccessResult | null
} {
  const { 
    isAuthenticated, 
    isLoading, 
    user, 
    hasAnyRole, 
    validateAccess 
  } = useAuth()
  const [accessResult, setAccessResult] = useState<RouteAccessResult | null>(null)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const checkAccess = () => {
      if (isLoading) return

      const hasPermission = (permission: ManufacturingPermission): boolean => {
        return user?.permissions.includes(permission) || false
      }

      const result = RouteAccessChecker.checkAccess(
        config,
        isAuthenticated,
        user?.roles || [],
        hasPermission,
        hasAnyRole,
        validateAccess
      )

      setAccessResult(result)
      setIsChecking(false)
    }

    checkAccess()
  }, [isAuthenticated, isLoading, user, config, hasAnyRole, validateAccess])

  return {
    hasAccess: accessResult?.hasAccess || false,
    isChecking: isLoading || isChecking,
    accessResult
  }
}

/**
 * Scheduling-specific route guard with granular permissions
 */
interface SchedulingRouteGuardProps {
  children: React.ReactNode
  requiredLevel?: 'admin' | 'management' | 'operational' | 'readonly'
  operation?: 'view' | 'edit' | 'manage' | 'create' | 'approve'
  fallback?: React.ReactNode
  redirectTo?: string
}

export function SchedulingRouteGuard({
  children,
  requiredLevel = 'readonly',
  operation = 'view',
  fallback,
  redirectTo = '/auth-demo'
}: SchedulingRouteGuardProps) {
  const { isAuthenticated, user } = useAuth()
  const router = useRouter()
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  const [accessLevel, setAccessLevel] = useState<string>('')

  useEffect(() => {
    // Dynamic import to avoid circular dependency
    import('@/lib/rbac').then(({ SchedulingPermissions }) => {
      if (!isAuthenticated) {
        setHasAccess(false)
        router.push(redirectTo)
        return
      }

      if (!user?.roles) {
        setHasAccess(false)
        router.push(redirectTo)
        return
      }

      const userAccessLevel = SchedulingPermissions.getAccessLevel(user.roles)
      setAccessLevel(userAccessLevel)
      
      // Check if user has required access level
      const accessLevels = ['none', 'readonly', 'operational', 'management', 'admin']
      const userLevelIndex = accessLevels.indexOf(userAccessLevel)
      const requiredLevelIndex = accessLevels.indexOf(requiredLevel)
      
      if (userLevelIndex < requiredLevelIndex) {
        setHasAccess(false)
        return
      }

      // Check specific operation permissions
      let hasOperationPermission = false
      switch (operation) {
        case 'view':
          hasOperationPermission = SchedulingPermissions.canViewSchedule(user.roles)
          break
        case 'edit':
          hasOperationPermission = SchedulingPermissions.canEditSchedule(user.roles)
          break
        case 'manage':
          hasOperationPermission = SchedulingPermissions.canManageQueue(user.roles)
          break
        case 'create':
          hasOperationPermission = SchedulingPermissions.canCreateOrders(user.roles)
          break
        case 'approve':
          hasOperationPermission = SchedulingPermissions.canApproveChanges(user.roles)
          break
        default:
          hasOperationPermission = true
      }

      setHasAccess(hasOperationPermission)
    })
  }, [isAuthenticated, user, requiredLevel, operation, router, redirectTo])

  // Loading state
  if (hasAccess === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-muted-foreground">Checking permissions...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || !user?.roles) {
    return fallback || (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
          <p className="text-muted-foreground">Please log in to access scheduling.</p>
        </div>
      </div>
    )
  }

  if (!hasAccess) {
    return fallback || (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            You need {requiredLevel} level access to {operation} scheduling content.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Your current access level: {accessLevel}
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
} 