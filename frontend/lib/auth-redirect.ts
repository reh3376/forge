/**
 * Azure Authentication Dynamic Redirect Utility
 * 
 * This utility implements dynamic redirects for Azure AD authentication,
 * allowing users to be redirected back to their intended destination after login
 * instead of always going to a fixed redirect URI.
 * 
 * Based on best practices from:
 * - Microsoft's MSAL documentation
 * - NextAuth.js patterns
 * - Azure AD security guidelines
 */

const REDIRECT_STORAGE_KEY = 'azure_auth_redirect_intent'
const REDIRECT_TIMESTAMP_KEY = 'azure_auth_redirect_timestamp'
const MAX_REDIRECT_AGE = 10 * 60 * 1000 // 10 minutes in milliseconds

/**
 * Interface for redirect intent data
 */
export interface RedirectIntent {
  path: string
  timestamp: number
  searchParams?: string
  hash?: string
}

/**
 * Validates if a redirect path is safe to use
 * Prevents open redirect vulnerabilities
 */
export function isValidRedirectPath(path: string): boolean {
  // Must start with / (relative path)
  if (!path.startsWith('/')) {
    return false
  }

  // Prevent protocol-relative URLs
  if (path.startsWith('//')) {
    return false
  }

  // Prevent javascript: or data: URLs
  if (path.match(/^\/[a-z]+:/i)) {
    return false
  }

  // Prevent paths with suspicious patterns
  const suspiciousPatterns = [
    /\.\./,  // Directory traversal
    /\/\//,  // Double slashes (except at start)
    /%2f/i,  // URL encoded slashes
    /%2e/i,  // URL encoded dots
  ]

  if (suspiciousPatterns.some(pattern => pattern.test(path))) {
    return false
  }

  return true
}

/**
 * Stores the current location as the redirect intent
 * Called before initiating login
 */
export function storeRedirectIntent(customPath?: string): void {
  try {
    const path = customPath || (typeof window !== 'undefined' ? window.location.pathname : '/')
    
    if (!isValidRedirectPath(path)) {
      console.warn('Invalid redirect path, using default:', path)
      return
    }

    const searchParams = typeof window !== 'undefined' ? window.location.search : undefined
    const hash = typeof window !== 'undefined' ? window.location.hash : undefined

    const intent: RedirectIntent = {
      path,
      timestamp: Date.now(),
      ...(searchParams && { searchParams }),
      ...(hash && { hash })
    }

    if (typeof window !== 'undefined') {
      sessionStorage.setItem(REDIRECT_STORAGE_KEY, JSON.stringify(intent))
      sessionStorage.setItem(REDIRECT_TIMESTAMP_KEY, intent.timestamp.toString())
    }

    console.log('Stored redirect intent:', intent)
  } catch (error) {
    console.error('Failed to store redirect intent:', error)
  }
}

/**
 * Retrieves and validates the stored redirect intent
 * Returns null if no valid intent is found
 */
export function getRedirectIntent(): RedirectIntent | null {
  try {
    if (typeof window === 'undefined') {
      return null
    }

    const storedIntent = sessionStorage.getItem(REDIRECT_STORAGE_KEY)
    const storedTimestamp = sessionStorage.getItem(REDIRECT_TIMESTAMP_KEY)

    if (!storedIntent || !storedTimestamp) {
      return null
    }

    const intent: RedirectIntent = JSON.parse(storedIntent)
    const timestamp = parseInt(storedTimestamp, 10)

    // Check if the intent is too old
    if (Date.now() - timestamp > MAX_REDIRECT_AGE) {
      console.log('Redirect intent expired, clearing')
      clearRedirectIntent()
      return null
    }

    // Validate the path
    if (!isValidRedirectPath(intent.path)) {
      console.warn('Invalid redirect path found, clearing:', intent.path)
      clearRedirectIntent()
      return null
    }

    return intent
  } catch (error) {
    console.error('Failed to retrieve redirect intent:', error)
    clearRedirectIntent()
    return null
  }
}

/**
 * Clears the stored redirect intent
 */
export function clearRedirectIntent(): void {
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(REDIRECT_STORAGE_KEY)
      sessionStorage.removeItem(REDIRECT_TIMESTAMP_KEY)
    }
  } catch (error) {
    console.error('Failed to clear redirect intent:', error)
  }
}

/**
 * Builds the full URL from a redirect intent
 */
export function buildRedirectUrl(intent: RedirectIntent): string {
  let url = intent.path

  if (intent.searchParams) {
    url += intent.searchParams
  }

  if (intent.hash) {
    url += intent.hash
  }

  return url
}

/**
 * Gets the redirect URL to use after successful authentication
 * Returns the stored intent or a default fallback
 */
export function getPostLoginRedirectUrl(fallback: string = '/dashboard'): string {
  const intent = getRedirectIntent()
  
  if (intent) {
    const url = buildRedirectUrl(intent)
    console.log('Using stored redirect intent:', url)
    clearRedirectIntent() // Clear after use
    return url
  }

  console.log('No valid redirect intent found, using fallback:', fallback)
  return fallback
}

/**
 * Whitelist of allowed redirect paths for additional security
 * Add your application's valid routes here
 */
const ALLOWED_REDIRECT_PATHS = [
  '/',
  '/dashboard',
  '/profile',
  '/settings',
  '/production',
  '/quality',
  '/maintenance',
  '/reports',
  '/admin',
  // Add more paths as needed
]

/**
 * Enhanced validation that checks against a whitelist
 * Use this for additional security in production
 */
export function isAllowedRedirectPath(path: string): boolean {
  if (!isValidRedirectPath(path)) {
    return false
  }

  // Extract just the pathname without query params or hash
  const pathname = path.split('?')[0]?.split('#')[0]

  if (!pathname) {
    return false
  }

  // Check exact matches first
  if (ALLOWED_REDIRECT_PATHS.includes(pathname)) {
    return true
  }

  // Check for dynamic routes (e.g., /production/line/123)
  const allowedPatterns = [
    /^\/production\/line\/\d+$/,
    /^\/quality\/batch\/\d+$/,
    /^\/maintenance\/equipment\/\d+$/,
    /^\/reports\/\w+$/,
    /^\/admin\/users\/\d+$/,
    // Add more patterns as needed
  ]

  return allowedPatterns.some(pattern => pattern.test(pathname))
}

/**
 * Hook for components to easily handle redirect intents
 */
export function useRedirectIntent() {
  const storeIntent = (customPath?: string) => {
    storeRedirectIntent(customPath)
  }

  const getIntent = () => {
    return getRedirectIntent()
  }

  const clearIntent = () => {
    clearRedirectIntent()
  }

  const getPostLoginUrl = (fallback?: string) => {
    return getPostLoginRedirectUrl(fallback)
  }

  return {
    storeIntent,
    getIntent,
    clearIntent,
    getPostLoginUrl
  }
} 