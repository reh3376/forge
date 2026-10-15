import {
  Home,
  FlaskConical,
  Calendar,
  Settings,
  Users,
  Shield,
  Activity,
  Calculator,
  Package,
  FunctionSquare,
  Beaker,
  SlidersHorizontal,
  LucideIcon
} from 'lucide-react'

export interface NavigationItem {
  id: string
  label: string
  href: string
  icon: LucideIcon
  description?: string
  badge?: string
  children?: NavigationItem[]
  permissions?: string[]
  external?: boolean
  parent?: string
}

export interface NavigationSection {
  id: string
  label: string
  items: NavigationItem[]
}

// Main navigation items
export const mainNavigation: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/',
    icon: Home,
    description: 'Production overview and key metrics'
  },
  {
    id: 'recipe-management',
    label: 'Recipe Management',
    href: '/recipe-management',
    icon: FlaskConical,
    description: 'Manage whiskey recipes and formulations'
  },
  {
    id: 'scheduling',
    label: 'Scheduling',
    href: '/scheduling',
    icon: Calendar,
    description: 'Production scheduling and planning'
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    href: '/diagnostics',
    icon: Activity,
    description: 'System diagnostics and health monitoring'
  },
  {
    id: 'configuration',
    label: 'Configuration',
    href: '/configuration',
    icon: Settings,
    description: 'System settings and configuration'
  }
]

// Secondary navigation sections (for sidebar)
export const sidebarNavigation: NavigationSection[] = [
  {
    id: 'production',
    label: 'Production',
    items: [
      {
        id: 'dashboard',
        label: 'Overview',
        href: '/',
        icon: Home,
        description: 'Production dashboard'
      }
    ]
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      {
        id: 'recipe-management',
        label: 'Recipes',
        href: '/recipe-management',
        icon: FlaskConical,
        description: 'Recipe management'
      },
      {
        id: 'scheduling',
        label: 'Scheduling',
        href: '/scheduling',
        icon: Calendar,
        description: 'Production scheduling'
      },
      {
        id: 'bom-consumption',
        label: 'BOM Consumption',
        href: '/operations/bom-consumption',
        icon: Package,
        description: 'Track material consumption with lot traceability'
      },
      {
        id: 'mashing-execution',
        label: 'Mashing Execution',
        href: '/operations/mashing-execution',
        icon: Beaker,
        description: 'S88 step execution for mashing operations'
      }
    ]
  },
  {
    id: 'system',
    label: 'System',
    items: [
      {
        id: 'diagnostics',
        label: 'Diagnostics',
        href: '/diagnostics',
        icon: Activity,
        description: 'System diagnostics and health monitoring'
      }
    ]
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      {
        id: 'users',
        label: 'Users',
        href: '/users',
        icon: Users,
        description: 'User management',
        permissions: ['admin']
      },
      {
        id: 'security',
        label: 'Security',
        href: '/security',
        icon: Shield,
        description: 'Security settings',
        permissions: ['admin']
      },
      {
        id: 'configuration',
        label: 'Configuration',
        href: '/configuration',
        icon: Settings,
        description: 'System configuration'
      },
      {
        id: 'enzyme-dosing',
        label: 'Enzyme Dosing',
        href: '/configuration/enzyme-dosing',
        icon: Calculator,
        description: 'Calculate enzyme dosing amounts'
      },
      {
        id: 'formula-library',
        label: 'Formula Library',
        href: '/configuration/formula-library',
        icon: FunctionSquare,
        description: 'Manage BOM calculation formulas'
      },
      {
        id: 'mashing-step-parameters',
        label: 'Mashing Parameters',
        href: '/configuration/mashing-step-parameters',
        icon: SlidersHorizontal,
        description: 'Configure mashing step parameter definitions'
      }
    ]
  }
]

// Breadcrumb configuration for complex routes
export const breadcrumbConfig: Record<string, { label: string; parent?: string }> = {
  '/': { label: 'Dashboard' },
  '/recipe-management': { label: 'Recipe Management', parent: '/' },
  '/recipe-management/create': { label: 'Create Recipe', parent: '/recipe-management' },
  '/recipe-management/[id]': { label: 'Recipe Details', parent: '/recipe-management' },
  '/recipe-management/[id]/edit': { label: 'Edit Recipe', parent: '/recipe-management/[id]' },
  '/configuration/enzyme-dosing': { label: 'Enzyme Dosing', parent: '/configuration' },
  '/configuration/formula-library': { label: 'Formula Library', parent: '/configuration' },
  '/configuration/mashing-step-parameters': { label: 'Mashing Parameters', parent: '/configuration' },
  '/scheduling': { label: 'Scheduling', parent: '/' },
  '/scheduling/create': { label: 'Create Schedule', parent: '/scheduling' },
  '/scheduling/[id]': { label: 'Schedule Details', parent: '/scheduling' },
  '/configuration': { label: 'Configuration', parent: '/' },
  '/configuration/assets': { label: 'Asset Management', parent: '/configuration' },
  '/configuration/users': { label: 'User Management', parent: '/configuration' },
  '/configuration/security': { label: 'Security Settings', parent: '/configuration' },
  '/users': { label: 'Users', parent: '/' },
  '/security': { label: 'Security', parent: '/' },
  '/diagnostics': { label: 'Diagnostics', parent: '/' },
  '/diagnostics/health-monitoring': { label: 'Health Monitoring', parent: '/diagnostics' },
  '/diagnostics/auth-status': { label: 'Authentication Status', parent: '/diagnostics' },
  '/diagnostics/role-debug': { label: 'Role & Permissions', parent: '/diagnostics' },
  '/diagnostics/env-check': { label: 'Environment Check', parent: '/diagnostics' },
  '/diagnostics/azure-config-checker': { label: 'Azure Configuration', parent: '/diagnostics' },
  '/diagnostics/schema-test': { label: 'Database Schema', parent: '/diagnostics' },
  '/diagnostics/schedule-api-test': { label: 'Schedule API Test', parent: '/diagnostics' },
  '/operations/bom-consumption': { label: 'BOM Consumption', parent: '/' },
  '/operations/mashing-execution': { label: 'Mashing Execution', parent: '/' },
  '/operations/mashing-execution/[scheduleOrderId]': { label: 'Step Execution', parent: '/operations/mashing-execution' }
}

// Utility functions
export function getNavigationItemById(id: string): NavigationItem | undefined {
  // Search in main navigation
  const mainItem = mainNavigation.find(item => item.id === id)
  if (mainItem) return mainItem

  // Search in sidebar navigation
  for (const section of sidebarNavigation) {
    const item = section.items.find(item => item.id === id)
    if (item) return item
  }

  return undefined
}

export function getNavigationItemByPath(path: string): NavigationItem | undefined {
  // Search in main navigation
  const mainItem = mainNavigation.find(item => item.href === path)
  if (mainItem) return mainItem

  // Search in sidebar navigation
  for (const section of sidebarNavigation) {
    const item = section.items.find(item => item.href === path)
    if (item) return item
  }

  return undefined
}

export function isActiveRoute(itemHref: string, currentPath: string): boolean {
  if (itemHref === '/') {
    return currentPath === '/'
  }

  // Exact match is always active
  if (currentPath === itemHref) return true

  // For parent routes, only match if no child route matches more specifically
  // This prevents /configuration from being active when on /configuration/enzyme-dosing
  const allNavItems = [...mainNavigation, ...sidebarNavigation.flatMap(s => s.items)]
  const hasMoreSpecificMatch = allNavItems.some(
    item => item.href !== itemHref &&
            item.href.startsWith(itemHref + '/') &&
            currentPath.startsWith(item.href)
  )

  if (hasMoreSpecificMatch) return false
  return currentPath.startsWith(itemHref)
}

export function filterNavigationByPermissions(
  items: NavigationItem[],
  userPermissions: string[] = []
): NavigationItem[] {
  return items.filter(item => {
    if (!item.permissions || item.permissions.length === 0) {
      return true
    }
    return item.permissions.some(permission => userPermissions.includes(permission))
  })
}

// Enhanced breadcrumb generation utility
export function generateBreadcrumbsFromPath(pathname: string): Array<{ label: string; href: string; isActive: boolean }> {
  const breadcrumbs: Array<{ label: string; href: string; isActive: boolean }> = []
  
  // Function to build breadcrumb chain recursively
  function buildBreadcrumbChain(path: string): void {
    // Handle dynamic routes by checking for exact match first, then pattern match
    let config = breadcrumbConfig[path]
    
    // If no exact match, try to match dynamic route patterns
    if (!config) {
      const dynamicPatterns = Object.keys(breadcrumbConfig).filter(key => key.includes('['))
      for (const pattern of dynamicPatterns) {
        const regex = new RegExp('^' + pattern.replace(/\[.*?\]/g, '[^/]+') + '$')
        if (regex.test(path)) {
          config = breadcrumbConfig[pattern]
          break
        }
      }
    }
    
    if (config) {
      // Add parent breadcrumbs first (recursive)
      if (config.parent && config.parent !== path) {
        buildBreadcrumbChain(config.parent)
      }
      
      // Add current breadcrumb
      breadcrumbs.push({
        label: config.label,
        href: path,
        isActive: path === pathname
      })
    }
  }
  
  buildBreadcrumbChain(pathname)
  
  // If no breadcrumbs were generated, at least show Dashboard
  if (breadcrumbs.length === 0) {
    breadcrumbs.push({
      label: 'Dashboard',
      href: '/',
      isActive: pathname === '/'
    })
  }
  
  return breadcrumbs
} 