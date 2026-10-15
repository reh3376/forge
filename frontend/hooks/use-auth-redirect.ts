/**
 * Custom hook for handling authentication redirects
 * 
 * This hook provides utilities for managing dynamic redirects
 * during the authentication flow, making it easy for components
 * to store and retrieve redirect intentions.
 */

import { useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  storeRedirectIntent, 
  getRedirectIntent, 
  clearRedirectIntent,
  isValidRedirectPath 
} from '@/lib/auth-redirect'

export interface UseAuthRedirectOptions {
  /**
   * Whether to automatically store the current path as redirect intent
   * when the hook is initialized (useful for protected routes)
   */
  autoStore?: boolean
  
  /**
   * Custom fallback path if no valid redirect intent is found
   */
  fallbackPath?: string
  
  /**
   * Whether to clear redirect intent after successful redirect
   */
  autoClear?: boolean
}

export function useAuthRedirect(options: UseAuthRedirectOptions = {}) {
  const router = useRouter()
  const {
    autoStore = false,
    fallbackPath = '/dashboard',
    autoClear = true
  } = options

  /**
   * Store the current path as redirect intent
   */
  const storeCurrentPath = useCallback(() => {
    const currentPath = window.location.pathname + window.location.search + window.location.hash
    if (isValidRedirectPath(currentPath)) {
      storeRedirectIntent(currentPath)
      return true
    }
    return false
  }, [])

  /**
   * Store a specific path as redirect intent
   */
  const storePath = useCallback((path: string) => {
    if (isValidRedirectPath(path)) {
      storeRedirectIntent(path)
      return true
    }
    return false
  }, [])

  /**
   * Get the stored redirect intent
   */
  const getStoredIntent = useCallback(() => {
    return getRedirectIntent()
  }, [])

  /**
   * Perform redirect to stored intent or fallback
   */
  const performRedirect = useCallback(() => {
    const intent = getRedirectIntent()
    const targetPath = intent?.path || fallbackPath
    
    if (autoClear) {
      clearRedirectIntent()
    }
    
    router.push(targetPath)
    return targetPath
  }, [router, fallbackPath, autoClear])

  /**
   * Clear stored redirect intent
   */
  const clearIntent = useCallback(() => {
    clearRedirectIntent()
  }, [])

  /**
   * Check if there's a valid stored redirect intent
   */
  const hasStoredIntent = useCallback(() => {
    const intent = getRedirectIntent()
    return intent !== null
  }, [])

  // Auto-store current path on mount if enabled
  useEffect(() => {
    if (autoStore) {
      storeCurrentPath()
    }
  }, [autoStore, storeCurrentPath])

  return {
    storeCurrentPath,
    storePath,
    getStoredIntent,
    performRedirect,
    clearIntent,
    hasStoredIntent
  }
} 