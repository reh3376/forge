'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/lib/auth-context'
import { ManufacturingRole, ManufacturingPermission } from '@/lib/auth-config'
import { LogOut, User, Shield, Clock, Building, Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { UserDetailModal } from './user-detail-modal'
import Image from 'next/image'

// Login button component
export function LoginButton() {
  const { login, isLoading, error, devMode } = useAuth()
  const [isHydrated, setIsHydrated] = useState(false)
  
  // Track hydration to prevent showing errors during hydration
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  const handleLogin = async () => {
    console.group('🔐 Azure Login Debug')
    console.log('Login button clicked at:', new Date().toISOString())
    
    // Store current location for redirect after login
    const currentPath = window.location.pathname + window.location.search
    sessionStorage.setItem('auth_redirect', currentPath)
    
    // Log environment variables
    console.log('Environment Variables:')
    console.log('  NEXT_PUBLIC_AZURE_AD_CLIENT_ID:', process.env['NEXT_PUBLIC_AZURE_AD_CLIENT_ID'] ? 'present' : 'missing')
    console.log('  NEXT_PUBLIC_AZURE_AD_TENANT_ID:', process.env['NEXT_PUBLIC_AZURE_AD_TENANT_ID'] ? 'present' : 'missing')
    console.log('  NEXT_PUBLIC_DISABLE_DEV_MODE:', process.env['NEXT_PUBLIC_DISABLE_DEV_MODE'])
    console.log('  NEXT_PUBLIC_ENABLE_DEMO_USER:', process.env['NEXT_PUBLIC_ENABLE_DEMO_USER'])
    
    // Log current URL and redirect info
    console.log('Current URL:', window.location.href)
    console.log('Origin:', window.location.origin)
    console.log('Protocol:', window.location.protocol)
    console.log('Host:', window.location.host)
    console.log('Saved redirect path:', currentPath)
    
    // Log auth state
    console.log('Auth State:')
    console.log('  isLoading:', isLoading)
    console.log('  error:', error)
    console.log('  devMode.isEnabled:', devMode.isEnabled)
    
    try {
      console.log('Calling login function...')
      await login()
      console.log('Login function completed successfully')
    } catch (error) {
      console.error('Login failed with error:', error)
      
      // Enhanced error logging
      if (error instanceof Error) {
        console.error('Error name:', error.name)
        console.error('Error message:', error.message)
        console.error('Error stack:', error.stack)
      }
      
      // Check for specific MSAL errors
      if (error && typeof error === 'object' && 'errorCode' in error) {
        const msalError = error as { errorCode?: string; errorMessage?: string; subError?: string }
        console.error('MSAL Error Code:', msalError.errorCode)
        console.error('MSAL Error Message:', msalError.errorMessage)
        console.error('MSAL Sub Error:', msalError.subError)
      }
      
      // Check for network issues
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.error('Network error detected - check internet connection and Azure endpoints')
      }
    } finally {
      console.groupEnd()
    }
  }

  // Determine button text and state
  const getButtonContent = () => {
    if (isLoading) {
      return (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
          {error ? 'Retrying...' : 'Signing in...'}
        </>
      )
    }
    
    return (
      <>
        <div className="flex items-center">
          <Image 
            src="/favicon.ico" 
            alt="Whiskey House" 
            width={20} 
            height={20} 
            className="mr-2"
          />
          Log Into Whiskey House
        </div>
      </>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button 
        onClick={handleLogin}
        disabled={isLoading}
        className="bg-gray-800 hover:bg-gray-900 text-white"
      >
        {getButtonContent()}
      </Button>
      
      {error && !isLoading && isHydrated && (
        <div className="max-w-xs">
          <p className="text-sm text-red-600 dark:text-red-400 text-center mb-2">
            {error}
          </p>
          <details className="text-xs text-gray-600 dark:text-gray-400">
            <summary className="cursor-pointer hover:text-gray-800 dark:hover:text-gray-200">
              Debug Info
            </summary>
            <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-left">
              <p><strong>Time:</strong> {new Date().toLocaleString()}</p>
              <p><strong>URL:</strong> {typeof window !== 'undefined' ? window.location.href : 'N/A'}</p>
              <p><strong>Client ID:</strong> {process.env['NEXT_PUBLIC_AZURE_AD_CLIENT_ID'] ? 'Configured' : 'Missing'}</p>
              <p><strong>Tenant ID:</strong> {process.env['NEXT_PUBLIC_AZURE_AD_TENANT_ID'] ? 'Configured' : 'Missing'}</p>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

// User avatar and dropdown menu
export function UserDropdown() {
  const { user, logout, isLoading } = useAuth()

  if (!user) return null

  const handleLogout = async () => {
    try {
      await logout()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  const getRoleDisplayName = (role: ManufacturingRole): string => {
    switch (role) {
      case ManufacturingRole.ET_ADMIN:
        return 'E&T Administrator'
      case ManufacturingRole.ET_CONTROLS:
        return 'E&T Controls'
      case ManufacturingRole.ET_DEVELOPER:
        return 'E&T Developer'
      case ManufacturingRole.OPS_DISTILLERY_LEADERSHIP:
        return 'Distillery Leadership'
      case ManufacturingRole.OPS_DISTILLERY_SUPERVISOR:
        return 'Distillery Supervisor'
      case ManufacturingRole.OPS_DISTILLERY_SHIFTLEAD:
        return 'Distillery Shift Lead'
      case ManufacturingRole.OPS_DISTILLERY_OPERATOR:
        return 'Distillery Operator'
      case ManufacturingRole.MAINTENANCE_LEADERSHIP:
        return 'Maintenance Leadership'
      case ManufacturingRole.MAINTENANCE_TECHNICIAN:
        return 'Maintenance Technician'
      default:
        return (role as string).replace(/[._]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
    }
  }

  const getRoleBadgeVariant = (role: ManufacturingRole) => {
    switch (role) {
      case ManufacturingRole.ET_ADMIN:
        return 'destructive'
      case ManufacturingRole.ET_CONTROLS:
      case ManufacturingRole.ET_DEVELOPER:
        return 'secondary'
      case ManufacturingRole.OPS_DISTILLERY_LEADERSHIP:
      case ManufacturingRole.MAINTENANCE_LEADERSHIP:
        return 'default'
      case ManufacturingRole.OPS_DISTILLERY_SUPERVISOR:
      case ManufacturingRole.OPS_DISTILLERY_SHIFTLEAD:
        return 'outline'
      case ManufacturingRole.OPS_DISTILLERY_OPERATOR:
      case ManufacturingRole.MAINTENANCE_TECHNICIAN:
        return 'outline'
      default:
        return 'outline'
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-auto px-3 py-2 rounded-md">
          <div className="flex items-center space-x-2">
            <User className="h-4 w-4" />
            <span className="text-sm font-medium">
              {user.name || user.email || 'User'}
            </span>
          </div>
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent className="w-80" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-2">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <p className="text-sm font-medium leading-none">{user.name}</p>
            </div>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
            
            {/* User Roles */}
            <div className="flex flex-wrap gap-1">
              {user.roles.map((role) => (
                <Badge 
                  key={role} 
                  variant={getRoleBadgeVariant(role)}
                  className="text-xs"
                >
                  {getRoleDisplayName(role)}
                </Badge>
              ))}
            </div>
          </div>
        </DropdownMenuLabel>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuGroup>
          <UserDetailModal 
            trigger={
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                <Eye className="mr-2 h-4 w-4" />
                <span>View Profile</span>
              </DropdownMenuItem>
            }
          />
          
          {user.department && (
            <DropdownMenuItem disabled>
              <Building className="mr-2 h-4 w-4" />
              <span>{user.department}</span>
            </DropdownMenuItem>
          )}
          
          {user.shift && (
            <DropdownMenuItem disabled>
              <Clock className="mr-2 h-4 w-4" />
              <span>Shift: {user.shift}</span>
            </DropdownMenuItem>
          )}
          
          <DropdownMenuItem disabled>
            <Shield className="mr-2 h-4 w-4" />
            <span>{user.permissions.length} permissions</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem 
          onClick={handleLogout}
          disabled={isLoading}
          className="text-red-600 focus:text-red-600 dark:text-red-400"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Combined authentication component
export function AuthButton() {
  const { isAuthenticated, isLoading, user, devMode } = useAuth()

  // Debug logging
  console.log('AuthButton render:')
  console.log('  isAuthenticated:', isAuthenticated)
  console.log('  isLoading:', isLoading)
  console.log('  user:', user)
  console.log('  devMode:', devMode)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-8 h-8">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
      </div>
    )
  }

  return isAuthenticated ? <UserDropdown /> : <LoginButton />
}

// Role-based access control component
interface RoleGuardProps {
  children: React.ReactNode
  allowedRoles: ManufacturingRole[]
  fallback?: React.ReactNode
}

export function RoleGuard({ children, allowedRoles, fallback }: RoleGuardProps) {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return fallback || null
  }

  const hasRequiredRole = user.roles.some(role => allowedRoles.includes(role))

  if (!hasRequiredRole) {
    return fallback || null
  }

  return <>{children}</>
}

// Permission-based access control component
interface PermissionGuardProps {
  children: React.ReactNode
  requiredPermissions: ManufacturingPermission[]
  requireAll?: boolean
  fallback?: React.ReactNode
}

export function PermissionGuard({ 
  children, 
  requiredPermissions, 
  requireAll = true, 
  fallback 
}: PermissionGuardProps) {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return fallback || null
  }

  const hasPermissions = requireAll
    ? requiredPermissions.every(permission => user.permissions.includes(permission))
    : requiredPermissions.some(permission => user.permissions.includes(permission))

  if (!hasPermissions) {
    return fallback || null
  }

  return <>{children}</>
} 