'use client'

import React, { ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { ManufacturingRole, ManufacturingPermission } from '@/lib/auth-config'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Shield, AlertTriangle } from 'lucide-react'
import { AuthButton } from './auth-button'

interface ProtectedRouteProps {
  children: ReactNode
  requiredRoles?: ManufacturingRole[]
  requiredPermissions?: ManufacturingPermission[]
  requireAll?: boolean
  fallbackPath?: string
  showLoginPrompt?: boolean
}

export function ProtectedRoute({
  children,
  requiredRoles = [],
  requiredPermissions = [],
  requireAll = false,
  fallbackPath = '/',
  showLoginPrompt = true
}: ProtectedRouteProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { 
    isAuthenticated, 
    isLoading, 
    user, 
    hasAnyRole, 
    canAccessRoute,
    validateAccess
  } = useAuth()

  // Show loading state while authentication is being determined
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  // Check if user is authenticated
  if (!isAuthenticated) {
    if (showLoginPrompt) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-96">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <Shield className="h-6 w-6" />
                Authentication Required
              </CardTitle>
              <CardDescription>
                You must be signed in to access this page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <AuthButton />
              </div>
              <div className="text-center">
                <Button 
                  variant="outline" 
                  onClick={() => router.push(fallbackPath)}
                  className="w-full"
                >
                  Return to Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    } else {
      router.push(fallbackPath)
      return null
    }
  }

  // Check route-level permissions
  if (!canAccessRoute(pathname)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-destructive">
              <AlertTriangle className="h-6 w-6" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You don&apos;t have permission to access this page
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground text-center">
              <p>Current role: {user?.roles.join(', ') || 'None'}</p>
              <p>Page: {pathname}</p>
            </div>
            <div className="text-center">
              <Button 
                variant="outline" 
                onClick={() => router.push(fallbackPath)}
                className="w-full"
              >
                Return to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Check specific role requirements
  if (requiredRoles.length > 0) {
    const hasRequiredRoles = requireAll 
      ? requiredRoles.every(role => user?.roles.includes(role))
      : hasAnyRole(requiredRoles)

    if (!hasRequiredRoles) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-96">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2 text-destructive">
                <AlertTriangle className="h-6 w-6" />
                Insufficient Role Access
              </CardTitle>
              <CardDescription>
                You need {requireAll ? 'all' : 'one'} of these roles: {requiredRoles.join(', ')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground text-center">
                <p>Your roles: {user?.roles.join(', ') || 'None'}</p>
                <p>Required: {requiredRoles.join(', ')}</p>
              </div>
              <div className="text-center">
                <Button 
                  variant="outline" 
                  onClick={() => router.push(fallbackPath)}
                  className="w-full"
                >
                  Return to Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }
  }

  // Check specific permission requirements
  if (requiredPermissions.length > 0) {
    const permissionCheck = validateAccess(requiredPermissions, requireAll)

    if (!permissionCheck.hasAccess) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-96">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2 text-destructive">
                <AlertTriangle className="h-6 w-6" />
                Insufficient Permissions
              </CardTitle>
              <CardDescription>
                You don&apos;t have the required permissions for this page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">Missing permissions:</p>
                <ul className="list-disc list-inside space-y-1">
                  {permissionCheck.missingPermissions.map(permission => (
                    <li key={permission}>{permission}</li>
                  ))}
                </ul>
              </div>
              <div className="text-center">
                <Button 
                  variant="outline" 
                  onClick={() => router.push(fallbackPath)}
                  className="w-full"
                >
                  Return to Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }
  }

  // All checks passed, render children
  return <>{children}</>
}

// Higher-order component for page-level protection
export function withRoleProtection<T extends object>(
  Component: React.ComponentType<T>,
  requiredRoles: ManufacturingRole[],
  requireAll: boolean = false
) {
  return function ProtectedComponent(props: T) {
    return (
      <ProtectedRoute requiredRoles={requiredRoles} requireAll={requireAll}>
        <Component {...props} />
      </ProtectedRoute>
    )
  }
}

// Higher-order component for permission-based protection
export function withPermissionProtection<T extends object>(
  Component: React.ComponentType<T>,
  requiredPermissions: ManufacturingPermission[],
  requireAll: boolean = false
) {
  return function ProtectedComponent(props: T) {
    return (
      <ProtectedRoute requiredPermissions={requiredPermissions} requireAll={requireAll}>
        <Component {...props} />
      </ProtectedRoute>
    )
  }
}

// Route guard hook for programmatic access control
export function useRouteGuard() {
  const { canAccessRoute, isAuthenticated } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const guardRoute = (targetRoute: string, fallbackRoute: string = '/') => {
    if (!isAuthenticated) {
      router.push('/')
      return false
    }

    if (!canAccessRoute(targetRoute)) {
      router.push(fallbackRoute)
      return false
    }

    return true
  }

  const canNavigateTo = (targetRoute: string) => {
    return isAuthenticated && canAccessRoute(targetRoute)
  }

  return {
    guardRoute,
    canNavigateTo,
    currentRouteAccess: canAccessRoute(pathname)
  }
} 