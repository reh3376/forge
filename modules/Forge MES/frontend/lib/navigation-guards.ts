export interface UserPermissions {
  canViewDashboard: boolean
  canViewRecipes: boolean
  canEditRecipes: boolean
  canViewScheduling: boolean
  canEditScheduling: boolean
  canViewConfiguration: boolean
  canEditConfiguration: boolean
  canViewUsers: boolean
  canEditUsers: boolean
  canViewSecurity: boolean
  canEditSecurity: boolean
  isAdmin: boolean
}

export interface NavigationGuard {
  path: string
  requiredPermissions: (keyof UserPermissions)[]
  fallbackPath?: string
  message?: string
}

// Default user permissions (can be overridden by auth system)
export const defaultPermissions: UserPermissions = {
  canViewDashboard: true,
  canViewRecipes: true,
  canEditRecipes: true,
  canViewScheduling: true,
  canEditScheduling: true,
  canViewConfiguration: true,
  canEditConfiguration: false, // Restricted by default
  canViewUsers: false, // Restricted by default
  canEditUsers: false,
  canViewSecurity: false, // Restricted by default
  canEditSecurity: false,
  isAdmin: false
}

// Navigation guards configuration
export const navigationGuards: NavigationGuard[] = [
  {
    path: '/configuration',
    requiredPermissions: ['canViewConfiguration'],
    fallbackPath: '/',
    message: 'You do not have permission to access configuration settings.'
  },
  {
    path: '/configuration/edit',
    requiredPermissions: ['canEditConfiguration'],
    fallbackPath: '/configuration',
    message: 'You do not have permission to edit configuration settings.'
  },
  {
    path: '/recipe-management/*/edit',
    requiredPermissions: ['canEditRecipes'],
    fallbackPath: '/recipe-management',
    message: 'You do not have permission to edit recipes.'
  },
  {
    path: '/scheduling/edit',
    requiredPermissions: ['canEditScheduling'],
    fallbackPath: '/scheduling',
    message: 'You do not have permission to edit schedules.'
  },
  {
    path: '/users',
    requiredPermissions: ['canViewUsers'],
    fallbackPath: '/',
    message: 'You do not have permission to view user management.'
  },
  {
    path: '/users/edit',
    requiredPermissions: ['canEditUsers'],
    fallbackPath: '/users',
    message: 'You do not have permission to edit users.'
  }
]

// Utility functions for navigation guards
export function hasPermission(
  userPermissions: UserPermissions,
  requiredPermissions: (keyof UserPermissions)[]
): boolean {
  // Admin users have all permissions
  if (userPermissions.isAdmin) {
    return true
  }

  // Check if user has all required permissions
  return requiredPermissions.every(permission => userPermissions[permission])
}

export function canAccessPath(
  path: string,
  userPermissions: UserPermissions
): { canAccess: boolean; guard?: NavigationGuard } {
  // Find matching guard for the path
  const guard = navigationGuards.find(guard => {
    // Handle wildcard paths
    if (guard.path.includes('*')) {
      const pattern = guard.path.replace(/\*/g, '[^/]+')
      const regex = new RegExp(`^${pattern}$`)
      return regex.test(path)
    }
    
    // Exact path match
    return guard.path === path
  })

  // If no guard found, access is allowed
  if (!guard) {
    return { canAccess: true }
  }

  // Check permissions
  const canAccess = hasPermission(userPermissions, guard.requiredPermissions)
  
  return { canAccess, guard }
}

interface NavigationItem {
  href?: string
  [key: string]: unknown
}

export function getAccessibleNavigation(
  navigationItems: NavigationItem[],
  userPermissions: UserPermissions
): NavigationItem[] {
  return navigationItems.filter(item => {
    if (!item.href) return true // Items without href are always accessible
    
    const { canAccess } = canAccessPath(item.href, userPermissions)
    return canAccess
  })
}

interface NavigationSection {
  items: NavigationItem[]
  [key: string]: unknown
}

interface Navigation {
  mainNavigation?: NavigationItem[]
  sidebarNavigation?: NavigationSection[]
  [key: string]: unknown
}

export function filterNavigationByPermissions(
  navigation: Navigation,
  userPermissions: UserPermissions
): Navigation {
  // Filter main navigation
  if (navigation.mainNavigation) {
    navigation.mainNavigation = getAccessibleNavigation(
      navigation.mainNavigation,
      userPermissions
    )
  }

  // Filter sidebar navigation
  if (navigation.sidebarNavigation) {
    navigation.sidebarNavigation = navigation.sidebarNavigation.map((section: NavigationSection) => ({
      ...section,
      items: getAccessibleNavigation(section.items, userPermissions)
    })).filter((section: NavigationSection) => section.items.length > 0) // Remove empty sections
  }

  return navigation
}

// Permission checking utilities
export function requiresPermission(path: string): boolean {
  return navigationGuards.some(guard => {
    if (guard.path.includes('*')) {
      const pattern = guard.path.replace(/\*/g, '[^/]+')
      const regex = new RegExp(`^${pattern}$`)
      return regex.test(path)
    }
    return guard.path === path
  })
}

export function getRequiredPermissions(path: string): (keyof UserPermissions)[] {
  const guard = navigationGuards.find(guard => {
    if (guard.path.includes('*')) {
      const pattern = guard.path.replace(/\*/g, '[^/]+')
      const regex = new RegExp(`^${pattern}$`)
      return regex.test(path)
    }
    return guard.path === path
  })

  return guard?.requiredPermissions || []
}

// Mock user roles for development/testing
export const mockUserRoles = {
  admin: {
    ...defaultPermissions,
    canEditConfiguration: true,
    canViewUsers: true,
    canEditUsers: true,
    canViewSecurity: true,
    canEditSecurity: true,
    isAdmin: true
  },
  manager: {
    ...defaultPermissions,
    canViewUsers: true,
    canViewSecurity: true
  },
  operator: {
    ...defaultPermissions,
    canEditRecipes: false,
    canEditScheduling: false,
    canViewConfiguration: false
  },
  viewer: {
    canViewDashboard: true,
    canViewRecipes: true,
    canEditRecipes: false,
    canViewScheduling: true,
    canEditScheduling: false,
    canViewConfiguration: false,
    canEditConfiguration: false,
    canViewUsers: false,
    canEditUsers: false,
    canViewSecurity: false,
    canEditSecurity: false,
    isAdmin: false
  }
} 