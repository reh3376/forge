'use client'

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { 
  PublicClientApplication,
  AccountInfo, 
  AuthenticationResult,
  SilentRequest,
  RedirectRequest,
  EndSessionRequest,
  EventType,
  EventMessage,
  InteractionStatus
} from '@azure/msal-browser'
import { 
  MsalProvider, 
  useMsal, 
  useIsAuthenticated, 
  useAccount
} from '@azure/msal-react'
import {
  getMsalConfig,
  loginRequest,
  silentRequest,
  ManufacturingRole,
  ManufacturingPermission,
  rolePermissions,
  manufacturingConfig,
  isAzureActuallyConfigured,
  isDevModeDisabled,
  isDemoUserEnabled,
  isE2EAutoLogin
} from './auth-config'
import { RBACService, ROUTE_ACCESS_CONTROL } from './rbac'
// Import token validation service
import { 
  tokenManager
} from './token-management'
// Import cross-tab synchronization service
import {
  CrossTabEventType,
  CrossTabSyncEvent,
  startCrossTabSync,
  stopCrossTabSync,
  addCrossTabListener,
  removeCrossTabListener,
  broadcastAuthChange
} from './cross-tab-sync'
// Import auth utils for demo state management
import { setDemoAuthState } from './auth-utils'

// MSAL instance - create dynamically to ensure environment variables are available
export const createMsalInstance = () => new PublicClientApplication(getMsalConfig())

// Lazy MSAL instance creation to avoid SSR issues
let _msalInstance: PublicClientApplication | null = null
export const getMsalInstance = (): PublicClientApplication => {
  if (!_msalInstance) {
    _msalInstance = createMsalInstance()
  }
  return _msalInstance
}

// Extended interface for ID token claims
interface IdTokenClaims {
  roles?: string[]
  department?: string
  shift?: string
  [key: string]: unknown
}

// User profile interface for manufacturing environment
export interface ManufacturingUser {
  id: string
  email: string
  name: string
  roles: ManufacturingRole[]
  permissions: ManufacturingPermission[]
  department?: string
  shift?: string
  lastLogin?: Date
  sessionExpiry?: Date
}

// Authentication state interface
export interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  user: ManufacturingUser | null
  account: AccountInfo | null
  error: string | null
  interactionInProgress: boolean
}

// Add these interfaces and state at the top after the existing interfaces
interface DevAuthState {
  isEnabled: boolean
  mockUser: ManufacturingUser | null
  mockAuthenticated: boolean
}

// Authentication context interface
export interface AuthContextType extends AuthState {
  login: () => Promise<void>
  logout: () => Promise<void>
  hasPermission: (permission: ManufacturingPermission) => boolean
  hasRole: (role: ManufacturingRole) => boolean
  hasAnyRole: (roles: ManufacturingRole[]) => boolean
  hasAllPermissions: (permissions: ManufacturingPermission[]) => boolean
  hasAnyPermission: (permissions: ManufacturingPermission[]) => boolean
  getEffectivePermissions: () => ManufacturingPermission[]
  getHighestRole: () => ManufacturingRole | null
  canAccessRoute: (route: string) => boolean
  validateAccess: (permissions: ManufacturingPermission[], requireAll?: boolean) => { hasAccess: boolean; missingPermissions: ManufacturingPermission[] }
  refreshToken: () => Promise<void>
  clearError: () => void
  // Development mode methods
  devMode: {
    isEnabled: boolean
    setAuthenticated: (authenticated: boolean) => void
    setRole: (role: ManufacturingRole | null) => void
    reset: () => void
    signInWithDemoUser: (role?: ManufacturingRole) => void
  }
}

// Create authentication context
const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Helper function to extract roles from account - improved to handle multiple claim sources
const extractUserRoles = (account: AccountInfo | null): ManufacturingRole[] => {
  if (!account || !account.idTokenClaims) {
    console.log('🔍 extractUserRoles: No account or claims found')
    return []
  }
  
  const claims = account.idTokenClaims as IdTokenClaims
  console.log('🔍 extractUserRoles: All claims:', claims)
  
  // Try multiple possible sources for roles in Azure AD tokens
  let roles: string[] = []
  
  // Standard roles claim
  if (claims.roles && Array.isArray(claims.roles)) {
    roles = [...roles, ...claims.roles]
    console.log('🔍 Found roles in "roles" claim:', claims.roles)
  }
  
  // App roles claim (sometimes used by Azure)
  if (claims['app_roles'] && Array.isArray(claims['app_roles'])) {
    roles = [...roles, ...(claims['app_roles'] as string[])]
    console.log('🔍 Found roles in "app_roles" claim:', claims['app_roles'])
  }
  
  // Extension roles (custom attributes)
  if (claims['extension_roles'] && Array.isArray(claims['extension_roles'])) {
    roles = [...roles, ...(claims['extension_roles'] as string[])]
    console.log('🔍 Found roles in "extension_roles" claim:', claims['extension_roles'])
  }
  
  // Groups claim (if roles are assigned via groups)
  if (claims['groups'] && Array.isArray(claims['groups'])) {
    roles = [...roles, ...(claims['groups'] as string[])]
    console.log('🔍 Found roles in "groups" claim:', claims['groups'])
  }
  
  // Custom role claims (check for any claim that might contain roles)
  Object.keys(claims).forEach(key => {
    if (key.toLowerCase().includes('role') && Array.isArray(claims[key])) {
      roles = [...roles, ...(claims[key] as string[])]
      console.log(`🔍 Found roles in "${key}" claim:`, claims[key])
    }
  })
  
  // Remove duplicates
  roles = [...new Set(roles)]
  console.log('🔍 All extracted roles (before filtering):', roles)
  
  // Filter to only include valid manufacturing roles
  const validRoles = roles.filter((role): role is ManufacturingRole => {
    const isValid = Object.values(ManufacturingRole).includes(role as ManufacturingRole)
    if (!isValid) {
      console.log(`🔍 Filtering out invalid role: "${role}"`)
    }
    return isValid
  })
  
  console.log('🔍 Final valid manufacturing roles:', validRoles)
  console.log('🔍 Expected manufacturing roles:', Object.values(ManufacturingRole))
  
  return validRoles
}

// Helper function to get permissions from roles
const getPermissionsFromRoles = (roles: ManufacturingRole[]): ManufacturingPermission[] => {
  const permissions = new Set<ManufacturingPermission>()
  
  roles.forEach(role => {
    rolePermissions[role]?.forEach(permission => {
      permissions.add(permission)
    })
  })
  
  return Array.from(permissions)
}

// Helper function to create manufacturing user from account
const createManufacturingUser = (account: AccountInfo): ManufacturingUser => {
  const roles = extractUserRoles(account)
  const permissions = getPermissionsFromRoles(roles)
  const claims = account.idTokenClaims as IdTokenClaims
  
  const user: ManufacturingUser = {
    id: account.localAccountId || account.homeAccountId,
    email: account.username,
    name: account.name || account.username,
    roles,
    permissions,
    lastLogin: new Date(),
    sessionExpiry: new Date(Date.now() + manufacturingConfig.sessionTimeout * 60 * 1000)
  }
  
  // Add optional properties only if they exist
  if (claims?.department) {
    user.department = claims.department
  }
  
  if (claims?.shift) {
    user.shift = claims.shift
  }
  
  return user
}

// Helper function to create mock user for development
const createMockUser = (role: ManufacturingRole | null): ManufacturingUser | null => {
  if (!role) return null

  const roles = [role]
  const permissions = getPermissionsFromRoles(roles)

  return {
    id: 'dev-user-123',
    email: 'developer@whiskeyhouse.com',
    name: 'Development User',
    roles,
    permissions,
    department: 'Development',
    shift: 'Day',
    lastLogin: new Date(),
    sessionExpiry: new Date(Date.now() + manufacturingConfig.sessionTimeout * 60 * 1000)
  }
}

// Module-level E2E auth state that persists across component remounts
// This is critical for Playwright tests where hydration can cause component re-initialization
let _e2eAuthState: DevAuthState | null = null

function getOrCreateE2EAuthState(): DevAuthState | null {
  // Only check/create once - this persists across remounts
  if (_e2eAuthState !== null) {
    console.log('🤖 E2E auto-login: Using persisted auth state', _e2eAuthState)
    return _e2eAuthState
  }

  const devModeDisabled = isDevModeDisabled()
  const demoUserEnabled = isDemoUserEnabled()
  const e2eAutoLogin = isE2EAutoLogin()
  const devModeEnabled = process.env.NODE_ENV === 'development' && !devModeDisabled && demoUserEnabled

  console.log('🤖 E2E auth check:', { devModeEnabled, e2eAutoLogin, devModeDisabled, demoUserEnabled })

  if (devModeEnabled && e2eAutoLogin) {
    console.log('🤖 E2E auto-login: Creating and persisting demo user')
    const autoLoginUser = createMockUser(ManufacturingRole.OPS_DISTILLERY_SUPERVISOR)
    _e2eAuthState = {
      isEnabled: true,
      mockUser: autoLoginUser,
      mockAuthenticated: true
    }
    return _e2eAuthState
  }

  return null
}

// MSAL-enabled authentication provider component
function MSALAuthProvider({ children }: { children: ReactNode }) {
  const { instance, accounts, inProgress } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const account = useAccount(accounts[0] || {})

  // CRITICAL: Initialize authState from persisted E2E state if available
  const [authState, setAuthState] = useState<AuthState>(() => {
    const persistedE2EState = getOrCreateE2EAuthState()
    if (persistedE2EState && persistedE2EState.mockAuthenticated) {
      console.log('MSALAuthProvider: Initializing authState from persisted E2E state')
      return {
        isAuthenticated: true,
        isLoading: false, // Never loading in E2E mode
        user: persistedE2EState.mockUser,
        account: null,
        error: null,
        interactionInProgress: false
      }
    }
    return {
      isAuthenticated: false,
      isLoading: true,
      user: null,
      account: null,
      error: null, // Always start with no error in MSAL provider
      interactionInProgress: false
    }
  })

  // Development mode state - now reactive to environment changes
  // CRITICAL: Check for persisted E2E auth state first to survive hydration remounts
  const [devAuthState, setDevAuthState] = useState<DevAuthState>(() => {
    // First, check for persisted E2E auth state (survives remounts)
    const persistedE2EState = getOrCreateE2EAuthState()
    if (persistedE2EState) {
      console.log('MSALAuthProvider: Using persisted E2E auth state')
      return persistedE2EState
    }

    // Add debugging
    console.log('Initializing auth state...')
    console.log('NEXT_PUBLIC_DISABLE_DEV_MODE:', process.env['NEXT_PUBLIC_DISABLE_DEV_MODE'])
    console.log('NEXT_PUBLIC_ENABLE_DEMO_USER:', process.env['NEXT_PUBLIC_ENABLE_DEMO_USER'])
    console.log('NEXT_PUBLIC_AZURE_AD_CLIENT_ID:', process.env['NEXT_PUBLIC_AZURE_AD_CLIENT_ID'])
    console.log('NEXT_PUBLIC_AZURE_AD_TENANT_ID:', process.env['NEXT_PUBLIC_AZURE_AD_TENANT_ID'])

    const azureActuallyConfigured = isAzureActuallyConfigured()
    const devModeDisabled = isDevModeDisabled()
    const demoUserEnabled = isDemoUserEnabled()
    console.log('isAzureActuallyConfigured check:')
    console.log('  clientId:', process.env['NEXT_PUBLIC_AZURE_AD_CLIENT_ID'] ? 'present' : 'missing')
    console.log('  tenantId:', process.env['NEXT_PUBLIC_AZURE_AD_TENANT_ID'] ? 'present' : 'missing')
    console.log('  result:', azureActuallyConfigured)
    console.log('isDevModeDisabled check:')
    console.log('  disableDevMode:', process.env['NEXT_PUBLIC_DISABLE_DEV_MODE'])
    console.log('  result:', devModeDisabled)
    console.log('isDemoUserEnabled check:')
    console.log('  enableDemoUser:', process.env['NEXT_PUBLIC_ENABLE_DEMO_USER'])
    console.log('  result:', demoUserEnabled)
    console.log('Azure actually configured:', azureActuallyConfigured)
    console.log('Dev mode disabled:', devModeDisabled)
    console.log('Demo user enabled:', demoUserEnabled)

    // Dev mode is enabled if ALL of these are true:
    // 1. We're in development environment (NODE_ENV === 'development')
    // 2. Dev mode is NOT explicitly disabled
    // 3. Demo user is explicitly enabled
    // Note: Azure configuration doesn't prevent dev mode - we can use demo mode even with Azure configured
    const devModeEnabled = process.env.NODE_ENV === 'development' && !devModeDisabled && demoUserEnabled
    console.log('Development mode enabled:', devModeEnabled)

    return {
      isEnabled: devModeEnabled,
      mockUser: null, // Never auto-login - user must explicitly sign in
      mockAuthenticated: false // Never auto-authenticate
    }
  })

  // Add effect to react to environment variable changes
  // CRITICAL: Skip if E2E auth state is persisted - it should not be modified
  useEffect(() => {
    // If we have persisted E2E state, don't allow any changes
    const persistedE2EState = getOrCreateE2EAuthState()
    if (persistedE2EState) {
      console.log('🤖 E2E auto-login: Skipping env change effect - using persisted state')
      // Ensure devAuthState matches persisted state
      if (devAuthState.mockUser !== persistedE2EState.mockUser ||
          devAuthState.mockAuthenticated !== persistedE2EState.mockAuthenticated) {
        console.log('🤖 E2E auto-login: Restoring persisted state')
        setDevAuthState(persistedE2EState)
      }
      return
    }

    const azureActuallyConfigured = isAzureActuallyConfigured()
    const devModeDisabled = isDevModeDisabled()
    const demoUserEnabled = isDemoUserEnabled()

    // Same logic as initialization
    const devModeEnabled = process.env.NODE_ENV === 'development' && !devModeDisabled && demoUserEnabled

    console.log('Environment check - Azure actually configured:', azureActuallyConfigured)
    console.log('Environment check - Dev mode disabled:', devModeDisabled)
    console.log('Environment check - Demo user enabled:', demoUserEnabled)
    console.log('Environment check - Dev mode enabled:', devModeEnabled)

    if (devAuthState.isEnabled !== devModeEnabled) {
      console.log('Updating dev mode state from', devAuthState.isEnabled, 'to', devModeEnabled)
      setDevAuthState({
        isEnabled: devModeEnabled,
        mockUser: null, // Never auto-login
        mockAuthenticated: false // Never auto-authenticate
      })
    }
  }, [devAuthState.isEnabled, devAuthState.mockUser, devAuthState.mockAuthenticated])

  // Update auth state based on MSAL state and development mode
  useEffect(() => {
    console.log('Auth state update triggered')
    console.log('devAuthState:', devAuthState)
    console.log('isAuthenticated:', isAuthenticated)
    console.log('accounts:', accounts)
    console.log('inProgress:', inProgress)
    
    if (devAuthState.isEnabled) {
      // Development mode is enabled - use mock authentication
      setAuthState(prev => ({
        ...prev,
        isAuthenticated: devAuthState.mockAuthenticated,
        user: devAuthState.mockUser,
        account: null,
        isLoading: false, // Never loading in dev mode
        interactionInProgress: false
      }))
    } else {
      // Development mode is disabled - check if Azure is actually configured
      const azureActuallyConfigured = isAzureActuallyConfigured()
      
      console.log('Azure actually configured:', azureActuallyConfigured)
      
      if (!azureActuallyConfigured) {
        // Azure is not configured but dev mode is disabled
        // Show login button but don't show loading spinner
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: false,
          user: null,
          account: null,
          isLoading: false, // Don't show loading when Azure is not configured
          interactionInProgress: false
        }))
      } else {
        // Azure is configured - use MSAL state
        const currentAccount = accounts[0]
        const user = currentAccount ? createManufacturingUser(currentAccount) : null
        
        setAuthState(prev => ({
          ...prev,
          isAuthenticated,
          account: currentAccount || null,
          user,
          // Be more aggressive about stopping loading - only show loading during login/logout interactions
          isLoading: inProgress === InteractionStatus.Login || inProgress === InteractionStatus.Logout,
          interactionInProgress: inProgress !== InteractionStatus.None,
          error: null // Clear any previous errors when using MSAL
        }))
      }
    }
  }, [isAuthenticated, accounts, inProgress, devAuthState])

  // Clear any previous errors when MSAL provider mounts
  useEffect(() => {
    console.log('MSALAuthProvider mounted - clearing any previous errors')
    setAuthState(prev => ({
      ...prev,
      error: null // Clear any errors from previous providers
    }))
  }, []) // Run once on mount

  // Force stop loading after initial mount to prevent infinite loading
  useEffect(() => {
    const forceStopLoading = setTimeout(() => {
      console.log('Force stopping loading after 2 seconds on mount')
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: null // Clear any errors when force stopping loading
      }))
    }, 2000) // Force stop loading after 2 seconds

    return () => clearTimeout(forceStopLoading)
  }, []) // Run once on mount

  // Set up MSAL event handling
  useEffect(() => {
    const callbackId = instance.addEventCallback((event: EventMessage) => {
      if (event.eventType === EventType.LOGIN_SUCCESS) {
        const result = event.payload as AuthenticationResult
        console.log('Login successful:', result.account?.username)
        
        // Update auth state with new account
        if (result.account) {
          const user = createManufacturingUser(result.account)
          setAuthState(prev => ({
            ...prev,
            isAuthenticated: true,
            account: result.account,
            user,
            error: null
          }))

          // Broadcast successful login to other tabs
          console.log('🔄 Broadcasting successful login to other tabs')
          broadcastAuthChange(CrossTabEventType.USER_SIGNED_IN, {
            isAuthenticated: true,
            account: result.account,
            user,
            error: null
          })
        }
      } else if (event.eventType === EventType.LOGIN_FAILURE) {
        const error = event.error
        console.error('Login failed:', error)
        setAuthState(prev => ({
          ...prev,
          error: error?.message || 'Login failed',
          isLoading: false
        }))

        // Broadcast login failure to other tabs
        console.log('🔄 Broadcasting login failure to other tabs')
        broadcastAuthChange(CrossTabEventType.AUTH_STATE_CHANGED, {
          isAuthenticated: false,
          account: null,
          user: null,
          error: error?.message || 'Login failed'
        })
      } else if (event.eventType === EventType.LOGOUT_SUCCESS) {
        console.log('Logout successful')
        
        // Update auth state
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: false,
          account: null,
          user: null,
          error: null
        }))

        // Broadcast logout to other tabs
        console.log('🔄 Broadcasting logout to other tabs')
        broadcastAuthChange(CrossTabEventType.USER_SIGNED_OUT, {
          isAuthenticated: false,
          account: null,
          user: null,
          error: null
        })
      } else if (event.eventType === EventType.ACQUIRE_TOKEN_SUCCESS) {
        const result = event.payload as AuthenticationResult
        console.log('Token acquired successfully for:', result.account?.username)
        
        // Update auth state with refreshed token
        if (result.account) {
          const user = createManufacturingUser(result.account)
          setAuthState(prev => ({
            ...prev,
            account: result.account,
            user,
            error: null
          }))

          // Broadcast token refresh to other tabs
          console.log('🔄 Broadcasting token refresh to other tabs')
          broadcastAuthChange(CrossTabEventType.TOKEN_REFRESHED, {
            isAuthenticated: true,
            account: result.account,
            user,
            error: null
          })
        }
      }
    })

    return () => {
      if (callbackId) {
        instance.removeEventCallback(callbackId)
      }
    }
  }, [instance])

  // Initialize cross-tab synchronization
  useEffect(() => {
    console.log('🔄 Initializing cross-tab synchronization...')
    
    // Start cross-tab sync service
    startCrossTabSync()
    
    // Set up cross-tab sync event listener
    const handleCrossTabEvent = (event: CrossTabSyncEvent) => {
      console.log('🔄 Received cross-tab sync event:', {
        type: event.type,
        fromTab: event.tabId,
        timestamp: new Date(event.timestamp).toISOString()
      })

      switch (event.type) {
        case CrossTabEventType.USER_SIGNED_IN:
          if (event.data.account && event.data.user) {
            console.log('🔄 Syncing sign-in from another tab')
            setAuthState(prev => ({
              ...prev,
              isAuthenticated: true,
              account: event.data.account!,
              user: event.data.user!,
              error: null
            }))
          }
          break

        case CrossTabEventType.USER_SIGNED_OUT:
          console.log('🔄 Syncing sign-out from another tab')
          setAuthState(prev => ({
            ...prev,
            isAuthenticated: false,
            account: null,
            user: null,
            error: null
          }))
          break

        case CrossTabEventType.TOKEN_REFRESHED:
          if (event.data.account && event.data.user) {
            console.log('🔄 Syncing token refresh from another tab')
            setAuthState(prev => ({
              ...prev,
              account: event.data.account!,
              user: event.data.user!,
              error: null
            }))
          }
          break

        case CrossTabEventType.SESSION_EXPIRED:
          console.log('🔄 Syncing session expiration from another tab')
          setAuthState(prev => ({
            ...prev,
            isAuthenticated: false,
            account: null,
            user: null,
            error: 'Session expired'
          }))
          break

        case CrossTabEventType.AUTH_STATE_CHANGED:
          if (event.data.isAuthenticated !== undefined) {
            console.log('🔄 Syncing auth state change from another tab')
            setAuthState(prev => ({
              ...prev,
              isAuthenticated: event.data.isAuthenticated!,
              account: event.data.account || null,
              user: event.data.user || null,
              error: event.data.error || null
            }))
          }
          break

        default:
          console.log('🔄 Unhandled cross-tab sync event type:', event.type)
      }
    }

    // Add the event listener
    addCrossTabListener(handleCrossTabEvent)
    
    console.log('🔄 Cross-tab synchronization initialized successfully')

    // Cleanup on unmount
    return () => {
      console.log('🔄 Cleaning up cross-tab synchronization...')
      removeCrossTabListener(handleCrossTabEvent)
      stopCrossTabSync()
    }
  }, []) // Run once on mount

  // Broadcast auth state changes to other tabs
  useEffect(() => {
    // Only broadcast if we're not in development mode and Azure is configured
    if (!devAuthState.isEnabled && isAzureActuallyConfigured()) {
      console.log('🔄 Broadcasting auth state change to other tabs:', {
        isAuthenticated: authState.isAuthenticated,
        hasUser: !!authState.user,
        hasAccount: !!authState.account
      })

      broadcastAuthChange(CrossTabEventType.AUTH_STATE_CHANGED, {
        isAuthenticated: authState.isAuthenticated,
        account: authState.account,
        user: authState.user,
        error: authState.error
      })
    }
  }, [authState.isAuthenticated, authState.account, authState.user, authState.error, devAuthState.isEnabled])

  // Cross-tab synchronization will be implemented later

  // Session persistence check function
  const checkPersistedSession = async () => {
    console.log('🔄 Enhanced session restoration starting...')

    // CRITICAL: Skip session restoration if E2E auto-login is active
    // E2E auth should take precedence over MSAL session restoration
    const persistedE2EState = getOrCreateE2EAuthState()
    if (persistedE2EState && persistedE2EState.mockAuthenticated) {
      console.log('🤖 E2E auto-login: Skipping MSAL session restoration - using E2E auth')
      return
    }

    // First, inspect localStorage for MSAL tokens
    const tokenInspection = tokenManager.inspectLocalStorageTokens()

    // First, check if Azure is actually configured
    if (!isAzureActuallyConfigured()) {
      console.log('🔄 Azure AD not configured - skipping MSAL token persistence check')
      console.log('💡 To test MSAL token persistence:')
      console.log('   1. Create .env.local file with Azure AD credentials')
      console.log('   2. Set NEXT_PUBLIC_AZURE_AD_CLIENT_ID and NEXT_PUBLIC_AZURE_AD_TENANT_ID')
      console.log('   3. Set NEXT_PUBLIC_DISABLE_DEV_MODE=true')
      console.log('   4. Restart the development server')
      console.log('   5. Login with real Azure AD account')
      
      if (tokenInspection.hasTokens) {
        console.log('📋 Found MSAL tokens in localStorage but Azure AD is not configured')
        console.log('📋 These tokens cannot be validated without proper Azure configuration')
        if (tokenInspection.summary.hasExpiredTokens) {
          console.log('📋 Some tokens appear to be expired - consider cleaning up localStorage')
        }
      }
      
      setAuthState(prev => ({
        ...prev,
        isAuthenticated: false,
        account: null,
        user: null,
        isLoading: false
      }))
      return
    }
    
    try {
      // Step 1: Check localStorage for existing MSAL cache
      const accounts = instance.getAllAccounts()
      console.log('🔄 Found accounts in localStorage cache:', accounts.length)
      
      // Debug: Show what's actually in localStorage
      if (typeof window !== 'undefined') {
        const msalKeys = Object.keys(localStorage).filter(key => key.includes('msal'))
        console.log('🔄 MSAL keys in localStorage:', msalKeys.length, msalKeys)
        
        if (msalKeys.length === 0) {
          console.log('🔄 No MSAL data found in localStorage - this indicates:')
          console.log('   - User has never logged in with Azure AD, OR')
          console.log('   - localStorage was cleared, OR')
          console.log('   - MSAL cache configuration issue')
        }
      }
      
      if (accounts.length === 0) {
        console.log('🔄 No accounts found in localStorage - user needs to sign in')
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: false,
          account: null,
          user: null,
          isLoading: false
        }))
        return
      }

      // Step 2: Validate cached tokens and select active account with comprehensive validation
      const account = accounts[0]
      console.log('🔄 Validating cached account:', account?.username)
      console.log('🔄 Account details:', {
        localAccountId: account?.localAccountId,
        homeAccountId: account?.homeAccountId,
        username: account?.username,
        name: account?.name,
        hasIdTokenClaims: !!account?.idTokenClaims
      })
      
      // Ensure account exists before proceeding
      if (!account) {
        console.log('🔄 No valid account found in cache')
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: false,
          account: null,
          user: null,
          isLoading: false
        }))
        return
      }

      // Step 2a: Basic token validation (simplified for now)
      console.log('🔍 Performing basic token validation...')
      
      // Basic validation - check if account has required properties
      if (!account.localAccountId || !account.username) {
        console.log('🔍 Token validation failed: missing required account properties')
        
        // Clear invalid tokens and reset state
        await instance.clearCache()
        console.log('🔍 Cleared invalid tokens from cache')
        
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: false,
          account: null,
          user: null,
          isLoading: false,
          error: null
        }))
        return
      }

      // Check if ID token claims exist
      if (!account.idTokenClaims) {
        console.log('🔍 Token validation failed: missing ID token claims')
        
        await instance.clearCache()
        console.log('🔍 Cleared invalid tokens from cache')
        
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: false,
          account: null,
          user: null,
          isLoading: false,
          error: null
        }))
        return
      }

      console.log('🔍 Basic token validation passed')
      
      // Set the active account for MSAL
      instance.setActiveAccount(account)
      console.log('🔄 Set active account:', account.username)

      // Step 3: Attempt silent token acquisition to validate session
      try {
        console.log('🔄 Attempting silent token acquisition for session validation...')
        const result = await instance.acquireTokenSilent({
          ...silentRequest,
          account: account // account is guaranteed to exist here
        })
        
        console.log('🔄 Silent token acquisition successful - session restored')
        console.log('✅ MSAL Token Persistence Working! User session restored from localStorage')
        
        if (result.account) {
          // Basic validation of the new token result
          if (!result.account?.localAccountId || !result.account?.username) {
            console.log('🔍 New token validation failed after silent acquisition')
            throw new Error('New token validation failed')
          }

          const user = createManufacturingUser(result.account)
          console.log('🔄 Session restored for user:', user.name, 'with roles:', user.roles)
          
          // Step 4: Initialize authentication state with restored session
          setAuthState(prev => ({
            ...prev,
            isAuthenticated: true,
            account: result.account,
            user,
            isLoading: false,
            error: null
          }))

          // Log successful session restoration
          console.log('✅ Session restoration successful for user:', user.id, 'with roles:', user.roles)

          // TODO: Schedule proactive token refresh if needed
          // Will implement proactive refresh scheduling in future iteration
        }
      } catch (error) {
        console.log('🔄 Silent token acquisition failed, checking if cached account is still valid...', error)
        console.log('🔄 This could mean:')
        console.log('   - Network connectivity issues')
        console.log('   - Azure AD service temporarily unavailable')
        console.log('   - Token needs interactive refresh')
        console.log('   - User account disabled or changed')
        
        // Step 5: Fallback to cached account if silent renewal fails but account exists
        // This handles cases where network is down but user should stay logged in
        if (account && account.idTokenClaims && account.localAccountId && account.username) {
          const user = createManufacturingUser(account)
          console.log('🔄 Using cached account for session restoration:', user.name)
          console.log('✅ MSAL Token Persistence Working! Using cached token (offline mode)')
          
          setAuthState(prev => ({
            ...prev,
            isAuthenticated: true,
            account,
            user,
            isLoading: false,
            error: null
          }))

          // Log fallback session restoration
          console.log('✅ Session restoration fallback for user:', user.id, 'with roles:', user.roles)
        } else {
          // Step 6: Clear invalid session data
          console.log('🔄 Account validation failed - clearing session')
          await instance.clearCache()
          
          setAuthState(prev => ({
            ...prev,
            isAuthenticated: false,
            account: null,
            user: null,
            isLoading: false,
            error: null
          }))

          console.log('❌ Session restoration failed: fallback validation failed')
        }
      }
    } catch (error) {
      console.error('🔄 Session restoration failed with error:', error)
      console.error('🔄 Critical session restoration failure - this indicates:')
      console.error('   - MSAL configuration error')
      console.error('   - localStorage access denied')
      console.error('   - Corrupted token data')
      console.error('   - Browser compatibility issue')
      
      // Step 7: Handle critical errors by clearing cache and resetting state
      try {
        await instance.clearCache()
        console.log('🔄 Cache cleared after critical session restoration failure')
      } catch (clearError) {
        console.error('🔄 Failed to clear cache after error:', clearError)
      }
      
      setAuthState(prev => ({
        ...prev,
        isAuthenticated: false,
        account: null,
        user: null,
        isLoading: false,
        error: null // Don't show error for failed session restoration to avoid user confusion
      }))

      // Log session restoration failure
      console.log('❌ Session restoration critical failure:', error instanceof Error ? error.message : 'Unknown error')
    }
  }

  // Enhanced session restoration with better triggering
  useEffect(() => {
    console.log('🔄 Session restoration useEffect triggered')
    console.log('🔄 Instance available:', !!instance)
    console.log('🔄 Azure configured check:', isAzureActuallyConfigured())
    console.log('🔄 InProgress status:', inProgress)
    
    // Only check for persisted session if Azure is configured and MSAL is not in progress
    if (isAzureActuallyConfigured() && inProgress === InteractionStatus.None) {
      console.log('🔄 Azure configured - starting enhanced session restoration')
      checkPersistedSession()
    } else {
      console.log('🔄 Azure not configured or MSAL in progress, skipping session restoration')
      console.log('💡 Currently running in development mode with demo users')
      console.log('💡 MSAL token persistence requires real Azure AD authentication')
      setAuthState(prev => ({
        ...prev,
        isLoading: false
      }))
    }
  }, [instance, inProgress]) // Added inProgress as dependency

  // Fallback session restoration trigger - runs once after component mount
  useEffect(() => {
    console.log('🔄 Fallback session restoration check')
    
    // Add a small delay to ensure MSAL is fully initialized
    const timer = setTimeout(() => {
      if (isAzureActuallyConfigured() && inProgress === InteractionStatus.None && !authState.isAuthenticated) {
        console.log('🔄 Fallback: Triggering session restoration after delay')
        checkPersistedSession()
      }
    }, 1000) // 1 second delay

    return () => clearTimeout(timer)
  }, []) // Run once on mount

  // Login function
  const login = async (): Promise<void> => {
    try {
      console.group('🔐 MSAL Login Process')
      console.log('Starting login process...')
      
      setAuthState(prev => ({ ...prev, error: null, isLoading: true }))
      
      // Log MSAL instance state
      console.log('MSAL Instance State:')
      console.log('  Active account:', instance.getActiveAccount())
      console.log('  All accounts:', instance.getAllAccounts())
      console.log('  Interaction in progress:', inProgress)
      
      const request: RedirectRequest = {
        ...loginRequest,
        redirectUri: window.location.origin
      }
      
      // Only add account if it exists
      if (account) {
        request.account = account
        console.log('Using existing account:', account.username)
      } else {
        console.log('No existing account found')
      }
      
      console.log('Login request configuration:')
      console.log('  Scopes:', request.scopes)
      console.log('  Redirect URI:', request.redirectUri)
      console.log('  Prompt:', request.prompt)
      const config = getMsalConfig()
      console.log('  Authority:', config.auth.authority)
      console.log('  Client ID:', config.auth.clientId)
      
      console.log('Initiating redirect login...')
      await instance.loginRedirect(request)
      console.log('Redirect initiated successfully')
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed'
      console.error('Login error in auth context:', error)
      
      // Enhanced error analysis
      if (error instanceof Error) {
        console.error('Error details:')
        console.error('  Name:', error.name)
        console.error('  Message:', error.message)
        console.error('  Stack:', error.stack)
      }
      
      // Check for MSAL-specific errors
      if (error && typeof error === 'object') {
        const msalError = error as { errorCode?: string; errorMessage?: string; subError?: string; correlationId?: string }
        if (msalError.errorCode) {
          console.error('MSAL Error Details:')
          console.error('  Error Code:', msalError.errorCode)
          console.error('  Error Message:', msalError.errorMessage)
          console.error('  Sub Error:', msalError.subError)
          console.error('  Correlation ID:', msalError.correlationId)
        }
      }
      
      setAuthState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false
      }))
      throw error
    } finally {
      console.groupEnd()
    }
  }

  // Logout function
  const logout = useCallback(async (): Promise<void> => {
    try {
      const config = getMsalConfig()
      const redirectUri = config.auth.postLogoutRedirectUri
      const request: EndSessionRequest = {}
      
      if (redirectUri) {
        request.postLogoutRedirectUri = redirectUri
      }
      
      // Only add account if it exists
      if (account) {
        request.account = account
      }
      
      await instance.logoutRedirect(request)
    } catch (error) {
      console.error('Logout error:', error)
      throw error
    }
  }, [account, instance])

  // Session timeout monitoring
  useEffect(() => {
    const checkSessionExpiry = () => {
      if (authState.user?.sessionExpiry && new Date() > authState.user.sessionExpiry) {
        console.log('Session expired, logging out...')
        logout()
      }
    }

    // Check session expiry every 5 minutes
    const interval = setInterval(checkSessionExpiry, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [authState.user, logout])

  // Token expiry monitoring
  useEffect(() => {
    const checkTokenExpiry = async () => {
      if (!authState.account) return

      try {
        // Attempt silent token acquisition to refresh if needed
        if (authState.account) {
          await instance.acquireTokenSilent({
            ...silentRequest,
            account: authState.account
          })
        }
      } catch (error) {
        console.warn('Token refresh failed:', error)
        // Let the user continue and handle it on next API call
      }
    }

    // Check token expiry every 30 minutes
    const interval = setInterval(checkTokenExpiry, 30 * 60 * 1000)

    return () => clearInterval(interval)
  }, [authState.account, instance])

  // Check if user has specific permission
  const hasPermission = (permission: ManufacturingPermission): boolean => {
    return authState.user?.permissions.includes(permission) || false
  }

  // Check if user has specific role
  const hasRole = (role: ManufacturingRole): boolean => {
    return authState.user?.roles.includes(role) || false
  }

  // Check if user has any of the specified roles
  const hasAnyRole = (roles: ManufacturingRole[]): boolean => {
    return roles.some(role => hasRole(role))
  }

  // Check if user has all of the specified permissions
  const hasAllPermissions = (permissions: ManufacturingPermission[]): boolean => {
    if (!authState.user?.roles) return false
    return RBACService.getEffectivePermissionsForRoles(authState.user.roles)
      .filter(permission => permissions.includes(permission)).length === permissions.length
  }

  // Check if user has any of the specified permissions
  const hasAnyPermission = (permissions: ManufacturingPermission[]): boolean => {
    if (!authState.user?.roles) return false
    const userPermissions = RBACService.getEffectivePermissionsForRoles(authState.user.roles)
    return permissions.some(permission => userPermissions.includes(permission))
  }

  // Get all effective permissions for the user (including inherited)
  const getEffectivePermissions = (): ManufacturingPermission[] => {
    if (!authState.user?.roles) return []
    return RBACService.getEffectivePermissionsForRoles(authState.user.roles)
  }

  // Get the highest role for the user
  const getHighestRole = (): ManufacturingRole | null => {
    if (!authState.user?.roles || authState.user.roles.length === 0) return null
    return RBACService.getHighestRole(authState.user.roles)
  }

  // Check if user can access a specific route
  const canAccessRoute = (route: string): boolean => {
    if (!authState.user?.roles) return false
    const requiredRoles = ROUTE_ACCESS_CONTROL[route as keyof typeof ROUTE_ACCESS_CONTROL]
    if (!requiredRoles) return true
    
    return requiredRoles.some(role => authState.user?.roles.includes(role))
  }

  // Validate access with detailed results
  const validateAccess = (
    permissions: ManufacturingPermission[], 
    requireAll: boolean = false
  ): { hasAccess: boolean; missingPermissions: ManufacturingPermission[] } => {
    if (!authState.user?.roles) {
      return { hasAccess: false, missingPermissions: permissions }
    }
    return RBACService.validateAccess(authState.user.roles, permissions, requireAll)
  }

  // Refresh authentication token
  const refreshToken = async (): Promise<void> => {
    if (!account) throw new Error('No account available for token refresh')
    
    try {
      const request: SilentRequest = {
        ...silentRequest,
        account
      }
      
      await instance.acquireTokenSilent(request)
    } catch (error) {
      console.error('Token refresh failed:', error)
      throw error
    }
  }

  // Clear authentication error
  const clearError = (): void => {
    setAuthState(prev => ({ ...prev, error: null }))
  }

  // Development mode functions
  const setDevAuthenticated = (authenticated: boolean) => {
    if (!devAuthState.isEnabled) return
    
    const newUser = authenticated ? (devAuthState.mockUser || createMockUser(ManufacturingRole.OPS_DISTILLERY_OPERATOR)) : null
    
    setDevAuthState(prev => ({
      ...prev,
      mockAuthenticated: authenticated,
      mockUser: newUser
    }))
    
    // Update auth headers state
    if (newUser) {
      setDemoAuthState(authenticated, newUser.id, newUser.roles[0])
    } else {
      setDemoAuthState(false)
    }
  }

  const setDevRole = (role: ManufacturingRole | null) => {
    if (!devAuthState.isEnabled) return
    
    const newUser = createMockUser(role)
    const authenticated = role !== null
    
    setDevAuthState(prev => ({
      ...prev,
      mockUser: newUser,
      mockAuthenticated: authenticated
    }))
    
    // Update auth headers state
    if (newUser) {
      setDemoAuthState(authenticated, newUser.id, newUser.roles[0])
    } else {
      setDemoAuthState(false)
    }
  }

  const resetDevMode = () => {
    if (!devAuthState.isEnabled) return
    
    setDevAuthState(prev => ({
      ...prev,
      mockUser: null,
      mockAuthenticated: false
    }))
    
    // Clear auth headers state
    setDemoAuthState(false)
  }

  const signInWithDemoUser = (role: ManufacturingRole = ManufacturingRole.OPS_DISTILLERY_SUPERVISOR) => {
    if (!devAuthState.isEnabled) return
    
    const newUser = createMockUser(role)
    
    setDevAuthState(prev => ({
      ...prev,
      mockUser: newUser,
      mockAuthenticated: true
    }))
    
    // Update auth headers state
    if (newUser) {
      setDemoAuthState(true, newUser.id, newUser.roles[0])
    }
  }

  const contextValue: AuthContextType = {
    ...authState,
    login,
    logout,
    hasPermission,
    hasRole,
    hasAnyRole,
    hasAllPermissions,
    hasAnyPermission,
    getEffectivePermissions,
    getHighestRole,
    canAccessRoute,
    validateAccess,
    refreshToken,
    clearError,
    devMode: {
      isEnabled: devAuthState.isEnabled,
      setAuthenticated: setDevAuthenticated,
      setRole: setDevRole,
      reset: resetDevMode,
      signInWithDemoUser
    }
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

// Non-MSAL authentication provider component (for when Azure is not configured)
function NonMSALAuthProvider({ children }: { children: ReactNode }) {
  // CRITICAL: Initialize authState from persisted E2E state if available
  const [authState, setAuthState] = useState<AuthState>(() => {
    const persistedE2EState = getOrCreateE2EAuthState()
    if (persistedE2EState && persistedE2EState.mockAuthenticated) {
      console.log('NonMSALAuthProvider: Initializing authState from persisted E2E state')
      return {
        isAuthenticated: true,
        isLoading: false,
        user: persistedE2EState.mockUser,
        account: null,
        error: null,
        interactionInProgress: false
      }
    }
    return {
      isAuthenticated: false,
      isLoading: false, // Never loading when Azure is not configured
      user: null,
      account: null,
      error: null,
      interactionInProgress: false
    }
  })

  // Development mode state
  // CRITICAL: Check for persisted E2E auth state first to survive hydration remounts
  const [devAuthState, setDevAuthState] = useState<DevAuthState>(() => {
    // First, check for persisted E2E auth state (survives remounts)
    const persistedE2EState = getOrCreateE2EAuthState()
    if (persistedE2EState) {
      console.log('NonMSALAuthProvider: Using persisted E2E auth state')
      return persistedE2EState
    }

    console.log('NonMSALAuthProvider - Initializing auth state...')
    console.log('NEXT_PUBLIC_DISABLE_DEV_MODE:', process.env['NEXT_PUBLIC_DISABLE_DEV_MODE'])
    console.log('NEXT_PUBLIC_ENABLE_DEMO_USER:', process.env['NEXT_PUBLIC_ENABLE_DEMO_USER'])

    const azureActuallyConfigured = isAzureActuallyConfigured()
    const devModeDisabled = isDevModeDisabled()
    const demoUserEnabled = isDemoUserEnabled()

    console.log('Azure actually configured:', azureActuallyConfigured)
    console.log('Dev mode disabled:', devModeDisabled)
    console.log('Demo user enabled:', demoUserEnabled)

    // Dev mode is enabled only if ALL of these are true:
    // 1. We're in development environment (NODE_ENV === 'development')
    // 2. Azure is NOT actually configured
    // 3. Dev mode is NOT explicitly disabled
    // 4. Demo user is explicitly enabled
    const devModeEnabled = process.env.NODE_ENV === 'development' && !devModeDisabled && demoUserEnabled
    console.log('Development mode enabled:', devModeEnabled)

    return {
      isEnabled: devModeEnabled,
      mockUser: null, // Never auto-login - user must explicitly sign in
      mockAuthenticated: false // Never auto-authenticate
    }
  })

  // Update auth state based on development mode
  useEffect(() => {
    console.log('NonMSALAuthProvider - Auth state update triggered')
    console.log('devAuthState:', devAuthState)
    
    if (devAuthState.isEnabled) {
      // Development mode is enabled - use mock authentication
      setAuthState(prev => ({
        ...prev,
        isAuthenticated: devAuthState.mockAuthenticated,
        user: devAuthState.mockUser,
        account: null,
        isLoading: false,
        interactionInProgress: false,
        error: null // Clear any previous errors
      }))
    } else {
      // Check if Azure is actually configured
      const azureActuallyConfigured = isAzureActuallyConfigured()
      
      if (azureActuallyConfigured) {
        // Azure is configured - we should never show an error in this case
        // This provider is only being used temporarily during hydration
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: false,
          user: null,
          account: null,
          isLoading: false, // Don't show loading when Azure is configured
          interactionInProgress: false,
          error: null // Never show error when Azure is configured
        }))
      } else {
        // Azure is not configured and dev mode is disabled
        // Only show error when Azure is truly not configured AND we're not in a hydration state
        const shouldShowError = typeof window !== 'undefined' // Only show error on client-side after hydration
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: false,
          user: null,
          account: null,
          isLoading: false,
          interactionInProgress: false,
          error: shouldShowError ? 'Azure AD is not configured. Please configure Azure AD credentials or enable development mode.' : null
        }))
      }
    }
  }, [devAuthState])

  // Dummy functions for when Azure is not configured
  const login = async (): Promise<void> => {
    const azureActuallyConfigured = isAzureActuallyConfigured()
    if (!azureActuallyConfigured && !devAuthState.isEnabled) {
      throw new Error('Azure AD is not configured. Cannot perform login.')
    }
    
    // If dev mode is enabled, allow demo login
    if (devAuthState.isEnabled) {
      // This will be handled by the demo login function
      return
    }
    
    throw new Error('Azure AD is not configured. Cannot perform login.')
  }

  const logout = async (): Promise<void> => {
    // In dev mode, just reset the mock state
    if (devAuthState.isEnabled) {
      setDevAuthState(prev => ({
        ...prev,
        mockAuthenticated: false,
        mockUser: null
      }))
    }
  }

  const hasPermission = (permission: ManufacturingPermission): boolean => {
    return authState.user?.permissions.includes(permission) || false
  }

  const hasRole = (role: ManufacturingRole): boolean => {
    return authState.user?.roles.includes(role) || false
  }

  const hasAnyRole = (roles: ManufacturingRole[]): boolean => {
    return roles.some(role => hasRole(role))
  }

  const hasAllPermissions = (permissions: ManufacturingPermission[]): boolean => {
    if (!authState.user?.roles) return false
    return RBACService.getEffectivePermissionsForRoles(authState.user.roles)
      .filter(permission => permissions.includes(permission)).length === permissions.length
  }

  const hasAnyPermission = (permissions: ManufacturingPermission[]): boolean => {
    if (!authState.user?.roles) return false
    const userPermissions = RBACService.getEffectivePermissionsForRoles(authState.user.roles)
    return permissions.some(permission => userPermissions.includes(permission))
  }

  const getEffectivePermissions = (): ManufacturingPermission[] => {
    if (!authState.user?.roles) return []
    return RBACService.getEffectivePermissionsForRoles(authState.user.roles)
  }

  const getHighestRole = (): ManufacturingRole | null => {
    if (!authState.user?.roles || authState.user.roles.length === 0) return null
    return RBACService.getHighestRole(authState.user.roles)
  }

  const canAccessRoute = (route: string): boolean => {
    if (!authState.user?.roles) return false
    const requiredRoles = ROUTE_ACCESS_CONTROL[route as keyof typeof ROUTE_ACCESS_CONTROL]
    if (!requiredRoles) return true
    
    return requiredRoles.some(role => authState.user?.roles.includes(role))
  }

  const validateAccess = (
    permissions: ManufacturingPermission[], 
    requireAll: boolean = false
  ): { hasAccess: boolean; missingPermissions: ManufacturingPermission[] } => {
    if (!authState.user?.roles) {
      return { hasAccess: false, missingPermissions: permissions }
    }
    return RBACService.validateAccess(authState.user.roles, permissions, requireAll)
  }

  const refreshToken = async (): Promise<void> => {
    throw new Error('Azure AD is not configured. Cannot refresh token.')
  }

  const clearError = (): void => {
    setAuthState(prev => ({ ...prev, error: null }))
  }

  // Development mode functions
  const setDevAuthenticated = (authenticated: boolean) => {
    if (!devAuthState.isEnabled) return
    
    const newUser = authenticated ? (devAuthState.mockUser || createMockUser(ManufacturingRole.OPS_DISTILLERY_OPERATOR)) : null
    
    setDevAuthState(prev => ({
      ...prev,
      mockAuthenticated: authenticated,
      mockUser: newUser
    }))
    
    // Update auth headers state
    if (newUser) {
      setDemoAuthState(authenticated, newUser.id, newUser.roles[0])
    } else {
      setDemoAuthState(false)
    }
  }

  const setDevRole = (role: ManufacturingRole | null) => {
    if (!devAuthState.isEnabled) return
    
    const newUser = createMockUser(role)
    const authenticated = role !== null
    
    setDevAuthState(prev => ({
      ...prev,
      mockUser: newUser,
      mockAuthenticated: authenticated
    }))
    
    // Update auth headers state
    if (newUser) {
      setDemoAuthState(authenticated, newUser.id, newUser.roles[0])
    } else {
      setDemoAuthState(false)
    }
  }

  const resetDevMode = () => {
    if (!devAuthState.isEnabled) return
    
    setDevAuthState(prev => ({
      ...prev,
      mockUser: null,
      mockAuthenticated: false
    }))
    
    // Clear auth headers state
    setDemoAuthState(false)
  }

  const signInWithDemoUser = (role: ManufacturingRole = ManufacturingRole.OPS_DISTILLERY_SUPERVISOR) => {
    if (!devAuthState.isEnabled) return
    
    const newUser = createMockUser(role)
    
    setDevAuthState(prev => ({
      ...prev,
      mockUser: newUser,
      mockAuthenticated: true
    }))
    
    // Update auth headers state
    if (newUser) {
      setDemoAuthState(true, newUser.id, newUser.roles[0])
    }
  }

  const contextValue: AuthContextType = {
    ...authState,
    login,
    logout,
    hasPermission,
    hasRole,
    hasAnyRole,
    hasAllPermissions,
    hasAnyPermission,
    getEffectivePermissions,
    getHighestRole,
    canAccessRoute,
    validateAccess,
    refreshToken,
    clearError,
    devMode: {
      isEnabled: devAuthState.isEnabled,
      setAuthenticated: setDevAuthenticated,
      setRole: setDevRole,
      reset: resetDevMode,
      signInWithDemoUser
    }
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

// Main authentication provider component that chooses between MSAL and non-MSAL
export function AuthProvider({ children }: { children: ReactNode }) {
  // This component is only used when we're inside MSALWrapper
  // If we're here, MSAL is available, so use MSALAuthProvider
  return <MSALAuthProvider>{children}</MSALAuthProvider>
}

// Custom hook to use authentication context
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Higher-order component for MSAL provider
export function MSALWrapper({ children }: { children: ReactNode }) {
  const [isClient, setIsClient] = useState(false)
  // Initialize with server-side configuration check to avoid hydration mismatch
  const [azureConfigured, setAzureConfigured] = useState(() => {
    // Only run configuration check on server-side or during SSR
    if (typeof window === 'undefined') {
      return isAzureActuallyConfigured()
    }
    return false
  })
  const [isHydrated, setIsHydrated] = useState(false)
  
  // Handle hydration and client-side configuration check
  useEffect(() => {
    console.log('MSALWrapper - useEffect triggered')
    console.log('MSALWrapper - typeof window:', typeof window)
    
    setIsClient(true)
    
    // Check configuration after hydration
    const checkConfig = () => {
      console.log('MSALWrapper - Checking configuration...')
      console.log('MSALWrapper - Environment variables:', {
        clientId: process.env['NEXT_PUBLIC_AZURE_AD_CLIENT_ID'] ? 'present' : 'missing',
        tenantId: process.env['NEXT_PUBLIC_AZURE_AD_TENANT_ID'] ? 'present' : 'missing',
        clientIdValue: process.env['NEXT_PUBLIC_AZURE_AD_CLIENT_ID'],
        tenantIdValue: process.env['NEXT_PUBLIC_AZURE_AD_TENANT_ID']
      })
      
      const configured = isAzureActuallyConfigured()
      console.log('MSALWrapper - Client-side Azure configured:', configured)
      console.log('MSALWrapper - Setting azureConfigured to:', configured)
      console.log('MSALWrapper - Setting isHydrated to: true')
      setAzureConfigured(configured)
      setIsHydrated(true)
    }
    
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      checkConfig()
    })
    
    // Also check after a small delay to handle any timing issues
    const timeoutId = setTimeout(() => {
      console.log('MSALWrapper - Delayed check after 100ms')
      checkConfig()
    }, 100)
    
    return () => {
      clearTimeout(timeoutId)
    }
  }, [])
  
  console.log('MSALWrapper - Render state:', { isClient, azureConfigured, isHydrated, windowDefined: typeof window !== 'undefined' })
  
  // During SSR or before hydration is complete, always use NonMSALAuthProvider
  // This ensures consistent rendering between server and client
  if (!isClient || !isHydrated) {
    console.log('MSALWrapper - Using NonMSALAuthProvider (SSR or pre-hydration)')
    return (
      <NonMSALAuthProvider>
        {children}
      </NonMSALAuthProvider>
    )
  }
  
  console.log('MSALWrapper - Final Azure configured:', azureConfigured)
  
  if (azureConfigured) {
    // Azure is properly configured - create fresh MSAL instance with current environment variables
    console.log('MSALWrapper - Using MSAL Provider')
    const freshMsalInstance = createMsalInstance()
    
    // Expose MSAL instance to window for debugging
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).msalInstance = freshMsalInstance
      console.log('🔧 MSAL instance exposed to window.msalInstance for debugging')
    }
    
    return (
      <MsalProvider instance={freshMsalInstance}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </MsalProvider>
    )
  } else {
    // Azure is not configured - use NonMSALAuthProvider directly
    console.log('MSALWrapper - Using NonMSALAuthProvider (not configured)')
    return (
      <NonMSALAuthProvider>
        {children}
      </NonMSALAuthProvider>
    )
  }
}

// Hook for role-based conditional rendering
export function useRoleAccess(requiredRoles: ManufacturingRole[]) {
  const { hasAnyRole, isAuthenticated } = useAuth()
  
  return {
    hasAccess: isAuthenticated && hasAnyRole(requiredRoles),
    isAuthenticated
  }
}

// Hook for permission-based conditional rendering  
export function usePermissionAccess(requiredPermissions: ManufacturingPermission[]) {
  const { hasPermission, isAuthenticated } = useAuth()
  
  const hasAllPermissions = requiredPermissions.every(permission => 
    hasPermission(permission)
  )
  
  return {
    hasAccess: isAuthenticated && hasAllPermissions,
    isAuthenticated,
    missingPermissions: requiredPermissions.filter(permission => 
      !hasPermission(permission)
    )
  }
} 