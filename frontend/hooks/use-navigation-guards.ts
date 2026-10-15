'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import {
  UserPermissions,
  canAccessPath,
  filterNavigationByPermissions,
  requiresPermission,
  getRequiredPermissions,
  mockUserRoles
} from '@/lib/navigation-guards'
import { useAuth } from '@/lib/auth-context'
import { ManufacturingPermission, ManufacturingRole } from '@/lib/auth-config'

// Define navigation type for better type safety
interface Navigation {
  mainNavigation?: Array<{ href?: string; [key: string]: unknown }>
  sidebarNavigation?: Array<{
    items: Array<{ href?: string; [key: string]: unknown }>
    [key: string]: unknown
  }>
  [key: string]: unknown
}

// Map ManufacturingPermissions to navigation guard permissions
function mapManufacturingPermissionsToNavGuards(manufacturingPermissions: ManufacturingPermission[]): UserPermissions {
  return {
    canViewDashboard: true, // Dashboard is generally accessible
    canViewRecipes: manufacturingPermissions.includes(ManufacturingPermission.VIEW_RECIPES),
    canEditRecipes: manufacturingPermissions.includes(ManufacturingPermission.EDIT_RECIPES),
    canViewScheduling: manufacturingPermissions.includes(ManufacturingPermission.VIEW_SCHEDULE),
    canEditScheduling: manufacturingPermissions.includes(ManufacturingPermission.EDIT_SCHEDULE),
    canViewConfiguration: manufacturingPermissions.includes(ManufacturingPermission.SYSTEM_SETTINGS),
    canEditConfiguration: manufacturingPermissions.includes(ManufacturingPermission.SYSTEM_SETTINGS),
    canViewUsers: manufacturingPermissions.includes(ManufacturingPermission.MANAGE_USERS),
    canEditUsers: manufacturingPermissions.includes(ManufacturingPermission.MANAGE_USERS),
    canViewSecurity: manufacturingPermissions.includes(ManufacturingPermission.SYSTEM_SETTINGS),
    canEditSecurity: manufacturingPermissions.includes(ManufacturingPermission.SYSTEM_SETTINGS),
    isAdmin: manufacturingPermissions.includes(ManufacturingPermission.SYSTEM_SETTINGS) && 
             manufacturingPermissions.includes(ManufacturingPermission.MANAGE_USERS)
  }
}

export function useNavigationGuards() {
  const router = useRouter()
  const pathname = usePathname()
  const auth = useAuth()
  
  // Map real authentication permissions to navigation guard permissions
  const userPermissions: UserPermissions = auth.user 
    ? mapManufacturingPermissionsToNavGuards(auth.user.permissions)
    : mapManufacturingPermissionsToNavGuards([]) // No permissions if not authenticated
  
  // For development/testing, allow role switching
  const [currentUserRole, setCurrentUserRole] = useState<string>(
    auth.user?.roles[0] || 'none'
  )

  // Update current role when auth state changes
  useEffect(() => {
    setCurrentUserRole(auth.user?.roles[0] || 'none')
  }, [auth.user])

  // Check if current path is accessible
  const checkCurrentPathAccess = useCallback(() => {
    const { canAccess, guard } = canAccessPath(pathname, userPermissions)
    
    if (!canAccess && guard) {
      toast.error(guard.message || 'Access denied')
      
      // Redirect to fallback path
      if (guard.fallbackPath) {
        router.push(guard.fallbackPath)
      } else {
        router.push('/')
      }
    }
    
    return canAccess
  }, [pathname, userPermissions, router])

  // Navigate with permission check
  const navigateWithGuard = useCallback((path: string) => {
    const { canAccess, guard } = canAccessPath(path, userPermissions)
    
    if (canAccess) {
      router.push(path)
    } else {
      toast.error(guard?.message || 'You do not have permission to access this page')
    }
  }, [userPermissions, router])

  // Filter navigation items based on permissions
  const getFilteredNavigation = useCallback((navigation: Navigation) => {
    return filterNavigationByPermissions(navigation, userPermissions)
  }, [userPermissions])

  // Check if user can access a specific path
  const canUserAccessPath = useCallback((path: string) => {
    const { canAccess } = canAccessPath(path, userPermissions)
    return canAccess
  }, [userPermissions])

  // Get user's permission status for a specific action
  const hasUserPermission = useCallback((permission: keyof UserPermissions) => {
    return userPermissions[permission] || userPermissions.isAdmin
  }, [userPermissions])

  // Switch user role (for development/testing) - uses the real auth system
  const switchUserRole = useCallback((role: keyof typeof mockUserRoles) => {
    if (auth.devMode.isEnabled) {
      // Map mock role to manufacturing role
      const roleMapping: Record<keyof typeof mockUserRoles, ManufacturingRole> = {
        admin: ManufacturingRole.ET_ADMIN,
        manager: ManufacturingRole.OPS_DISTILLERY_LEADERSHIP, 
        operator: ManufacturingRole.OPS_DISTILLERY_OPERATOR,
        viewer: ManufacturingRole.OPS_DISTILLERY_OPERATOR
      }
      
      const manufacturingRole = roleMapping[role]
      if (manufacturingRole) {
        auth.devMode.setRole(manufacturingRole)
        setCurrentUserRole(role)
        toast.success(`Switched to ${role} role`)
        
        // Check if current path is still accessible
        setTimeout(() => {
          checkCurrentPathAccess()
        }, 100)
      }
    } else {
      toast.error('Role switching is only available in development mode')
    }
  }, [auth.devMode, checkCurrentPathAccess])

  // DISABLED: Check path access on route changes
  // This was causing conflicts with the RBAC RouteGuard system
  // The RouteGuard components handle access control at the page level
  // useEffect(() => {
  //   checkCurrentPathAccess()
  // }, [checkCurrentPathAccess])

  // Listen for navigation guard events
  useEffect(() => {
    const handleNavigationGuard = (event: CustomEvent) => {
      const { path } = event.detail
      navigateWithGuard(path)
    }

    window.addEventListener('navigate-with-guard', handleNavigationGuard as EventListener)
    return () => {
      window.removeEventListener('navigate-with-guard', handleNavigationGuard as EventListener)
    }
  }, [navigateWithGuard])

  return {
    userPermissions,
    currentUserRole,
    canUserAccessPath,
    hasUserPermission,
    navigateWithGuard,
    getFilteredNavigation,
    switchUserRole,
    checkCurrentPathAccess,
    requiresPermission: (path: string) => requiresPermission(path),
    getRequiredPermissions: (path: string) => getRequiredPermissions(path),
    availableRoles: Object.keys(mockUserRoles) as (keyof typeof mockUserRoles)[],
    // Expose real auth info for debugging
    realAuth: {
      isAuthenticated: auth.isAuthenticated,
      user: auth.user,
      permissions: auth.user?.permissions || [],
      roles: auth.user?.roles || []
    }
  }
} 