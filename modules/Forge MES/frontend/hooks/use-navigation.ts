'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { 
  mainNavigation, 
  sidebarNavigation, 
  getNavigationItemByPath, 
  isActiveRoute,
  filterNavigationByPermissions,
  generateBreadcrumbsFromPath
} from '@/lib/navigation'
import { useNavigationGuards } from './use-navigation-guards'

interface UseNavigationOptions {
  userPermissions?: string[]
}

export function useNavigation(options: UseNavigationOptions = {}) {
  const pathname = usePathname()
  const router = useRouter()
  const { userPermissions = [] } = options
  const { navigateWithGuard } = useNavigationGuards()

  // Get current navigation item
  const currentItem = useMemo(() => {
    return getNavigationItemByPath(pathname)
  }, [pathname])

  // Filter navigation items by permissions
  const filteredMainNavigation = useMemo(() => {
    return filterNavigationByPermissions(mainNavigation, userPermissions)
  }, [userPermissions])

  const filteredSidebarNavigation = useMemo(() => {
    return sidebarNavigation.map(section => ({
      ...section,
      items: filterNavigationByPermissions(section.items, userPermissions)
    })).filter(section => section.items.length > 0)
  }, [userPermissions])

  // Navigation utilities with guard support
  const navigate = (href: string) => {
    navigateWithGuard(href)
  }

  // Fallback to regular navigation if guards are not available
  const navigateRegular = (href: string) => {
    router.push(href)
  }

  const isActive = (href: string) => {
    return isActiveRoute(href, pathname)
  }

  const getActiveSection = () => {
    for (const section of filteredSidebarNavigation) {
      const activeItem = section.items.find(item => isActive(item.href))
      if (activeItem) {
        return section
      }
    }
    return null
  }

  // Breadcrumb generation
  const generateBreadcrumbs = () => {
    return generateBreadcrumbsFromPath(pathname)
  }

  return {
    // Current state
    pathname,
    currentItem,
    
    // Navigation data
    mainNavigation: filteredMainNavigation,
    sidebarNavigation: filteredSidebarNavigation,
    
    // Utilities
    navigate,
    navigateRegular,
    isActive,
    getActiveSection,
    generateBreadcrumbs,
    
    // Breadcrumbs
    breadcrumbs: generateBreadcrumbs()
  }
} 