import { useState, useCallback, useEffect } from 'react'
import { jwtAuthService, type JWTAuthResponse, type JWTUser } from '../lib/auth/jwt-auth'

interface UseJWTAuthReturn {
  // State
  isAuthenticated: boolean
  user: JWTUser | null
  isLoading: boolean
  error: string | null

  // Actions
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  clearError: () => void
  
  // Utilities
  getToken: () => string | null
  refreshAuth: () => void
}

/**
 * React hook for JWT authentication
 * Provides login, logout, and authentication state management
 */
export const useJWTAuth = (): UseJWTAuthReturn => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
  const [user, setUser] = useState<JWTUser | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Check authentication status on mount and when localStorage changes
  const refreshAuth = useCallback(() => {
    const authenticated = jwtAuthService.isAuthenticated()
    const userData = jwtAuthService.getUser()
    
    setIsAuthenticated(authenticated)
    setUser(userData)
    
    console.log('🔐 JWT Auth status refreshed:', { authenticated, user: userData?.username })
  }, [])

  // Login function
  const login = useCallback(async (username: string, password: string): Promise<void> => {
    setIsLoading(true)
    setError(null)

    try {
      console.log('🔐 Starting JWT login for:', username)
      
      const authResponse: JWTAuthResponse = await jwtAuthService.login(username, password)
      
      console.log('🔐 JWT login successful:', {
        username: authResponse.username,
        roles: authResponse.roles
      })

      // Refresh auth state
      refreshAuth()
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed'
      console.error('🔐 JWT login failed:', errorMessage)
      setError(errorMessage)
      
      // Ensure we're not authenticated on error
      setIsAuthenticated(false)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [refreshAuth])

  // Logout function
  const logout = useCallback(() => {
    console.log('🔐 JWT logout initiated')
    
    jwtAuthService.logout()
    setIsAuthenticated(false)
    setUser(null)
    setError(null)
    
    console.log('🔐 JWT logout completed')
  }, [])

  // Clear error function
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Get token function
  const getToken = useCallback(() => {
    return jwtAuthService.getToken()
  }, [])

  // Initialize auth state on mount
  useEffect(() => {
    refreshAuth()
  }, [refreshAuth])

  // Listen for storage changes (for multi-tab support)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'jwt_token' || e.key === 'jwt_user') {
        console.log('🔐 JWT storage changed, refreshing auth state')
        refreshAuth()
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [refreshAuth])

  return {
    // State
    isAuthenticated,
    user,
    isLoading,
    error,

    // Actions
    login,
    logout,
    clearError,
    
    // Utilities
    getToken,
    refreshAuth,
  }
} 