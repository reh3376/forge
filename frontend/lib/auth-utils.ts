import { getMsalInstance } from './auth-context'
import { silentRequest } from './auth-config'
import { isAzureActuallyConfigured, isDemoUserEnabled } from './auth-config'
import { jwtAuthService } from './auth/jwt-auth'

/**
 * Get authentication token for API calls
 * This function properly integrates with MSAL and handles both real auth and demo mode
 */
export const getAuthToken = async (): Promise<string | null> => {
  // If Azure is not configured, return null (demo mode will handle this)
  if (!isAzureActuallyConfigured()) {
    console.log('🔐 Azure not configured, returning null token for demo mode')
    return null
  }

  try {
    const msalInstance = getMsalInstance()
    const accounts = msalInstance.getAllAccounts()
    
    if (accounts.length === 0) {
      console.log('🔐 No MSAL accounts found')
      return null
    }

    const account = accounts[0]
    
    // Ensure account exists before proceeding
    if (!account) {
      console.log('🔐 No valid account found')
      return null
    }
    
    // Try to get token silently
    const result = await msalInstance.acquireTokenSilent({
      ...silentRequest,
      account
    })
    
    console.log('🔐 Successfully acquired token silently')
    return result.accessToken
    
  } catch (error) {
    console.error('🔐 Failed to acquire token:', error)
    
    // If silent token acquisition fails, we could trigger interactive login
    // but for API calls, we'll just return null and let the calling code handle it
    return null
  }
}

/**
 * Check if we're in demo mode and user is authenticated
 */
const isDemoUserAuthenticated = (): boolean => {
  if (typeof window === 'undefined') return false
  
  // Check if demo mode is enabled
  if (!isDemoUserEnabled()) return false
  
  // Check if user is authenticated in demo mode by looking at auth context state
  // We'll use a simple localStorage flag that the auth context can set
  const demoAuthState = localStorage.getItem('demo_auth_state')
  return demoAuthState === 'authenticated'
}

/**
 * Get demo user info for headers
 */
const getDemoUserInfo = (): { userId: string; role: string } | null => {
  if (typeof window === 'undefined') return null
  
  const demoUserId = localStorage.getItem('demo_user_id') || 'demo-user-supervisor'
  const demoUserRole = localStorage.getItem('demo_user_role') || 'OPS_DISTILLERY_SUPERVISOR'
  
  return { userId: demoUserId, role: demoUserRole }
}

/**
 * Get authentication headers for API calls
 * Includes both MSAL and JWT tokens for authentication, plus demo mode support
 */
export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  console.log('🔐 getAuthHeaders called')
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // First, try to get JWT token (for backend authentication)
  try {
    const jwtToken = jwtAuthService.getToken()
    
    if (jwtToken) {
      headers['Authorization'] = `Bearer ${jwtToken}`
      console.log('🔐 Added Authorization header with JWT Bearer token')
      return headers
    } else {
      console.log('🔐 No JWT token available')
    }
  } catch (error) {
    console.error('🔐 Error getting JWT token:', error)
  }

  // If no JWT token, try to get MSAL token
  try {
    const msalToken = await getAuthToken()
    
    console.log('🔐 MSAL authentication token result:', { 
      hasToken: !!msalToken,
      tokenLength: msalToken?.length || 0
    })
    
    if (msalToken) {
      headers['Authorization'] = `Bearer ${msalToken}`
      console.log('🔐 Added Authorization header with MSAL Bearer token')
      return headers
    } else {
      console.log('🔐 No MSAL token available for Authorization header')
    }
  } catch (error) {
    console.error('🔐 Error getting MSAL auth token:', error)
  }

  // If no real tokens and we're in development mode, check for demo user authentication
  if (process.env.NODE_ENV === 'development') {
    const isDemoAuth = isDemoUserAuthenticated()
    console.log('🔐 Demo user authentication check:', { isDemoAuth, isDemoEnabled: isDemoUserEnabled() })
    
    if (isDemoAuth) {
      const demoUserInfo = getDemoUserInfo()
      if (demoUserInfo) {
        // Add demo user headers for authenticated demo user
        headers['x-development-mode'] = 'true'
        headers['x-demo-user'] = 'true'
        headers['x-demo-user-id'] = demoUserInfo.userId
        headers['x-demo-user-role'] = demoUserInfo.role
        headers['x-demo-authenticated'] = 'true'
        console.log('🔐 Added demo user authentication headers:', {
          userId: demoUserInfo.userId,
          role: demoUserInfo.role
        })
        return headers
      }
    } else if (isDemoUserEnabled()) {
      // Add basic demo headers for unauthenticated demo mode
      headers['x-development-mode'] = 'true'
      headers['x-demo-user'] = 'true'
      headers['x-demo-user-id'] = 'demo-user-supervisor'
      headers['x-demo-user-role'] = 'OPS_DISTILLERY_SUPERVISOR'
      console.log('🔐 Added basic demo user headers (unauthenticated)')
      return headers
    }
  }

  console.log('🔐 No authentication headers available')
  return headers
}

/**
 * Set demo user authentication state (called by auth context)
 */
export const setDemoAuthState = (authenticated: boolean, userId?: string, role?: string): void => {
  if (typeof window === 'undefined') return
  
  if (authenticated) {
    localStorage.setItem('demo_auth_state', 'authenticated')
    if (userId) localStorage.setItem('demo_user_id', userId)
    if (role) localStorage.setItem('demo_user_role', role)
    console.log('🔐 Demo auth state set to authenticated:', { userId, role })
  } else {
    localStorage.removeItem('demo_auth_state')
    localStorage.removeItem('demo_user_id')
    localStorage.removeItem('demo_user_role')
    console.log('🔐 Demo auth state cleared')
  }
}

/**
 * Check if user is authenticated (has valid JWT token or MSAL token or is in demo mode)
 */
export const isAuthenticated = async (): Promise<boolean> => {
  // First check for JWT authentication
  if (jwtAuthService.isAuthenticated()) {
    return true
  }
  
  // Then check for MSAL token
  const msalToken = await getAuthToken()
  if (msalToken !== null) {
    return true
  }
  
  // Finally check for demo user authentication
  if (process.env.NODE_ENV === 'development' && isDemoUserAuthenticated()) {
    return true
  }
  
  return false
} 