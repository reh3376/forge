import { Configuration, LogLevel, AccountInfo } from '@azure/msal-browser'

// Distillery-specific user roles for Whiskey House of Kentucky operations
export enum ManufacturingRole {
  // Engineering & Technology
  ET_ADMIN = 'e&t.admin',
  ET_CONTROLS = 'e&t.controls',
  ET_DEVELOPER = 'e&t.developer',
  
  // Operations - Distillery
  OPS_DISTILLERY_LEADERSHIP = 'operations.distillery.leadership',
  OPS_DISTILLERY_SUPERVISOR = 'operations.distillery.supervisor',
  OPS_DISTILLERY_SHIFTLEAD = 'operations.distillery.shiftlead',
  OPS_DISTILLERY_OPERATOR = 'operations.distillery.operator',
  
  // Maintenance
  MAINTENANCE_LEADERSHIP = 'maintenance.leadership',
  MAINTENANCE_TECHNICIAN = 'maintenance.technician'
}

// Manufacturing permissions for different operations
export enum ManufacturingPermission {
  // Production Operations
  VIEW_PRODUCTION = 'production.view',
  EDIT_PRODUCTION = 'production.edit',
  CREATE_PRODUCTION_ORDER = 'production.create_order',
  APPROVE_PRODUCTION_ORDER = 'production.approve_order',
  
  // Recipe Management
  VIEW_RECIPES = 'recipes.view',
  EDIT_RECIPES = 'recipes.edit',
  CREATE_RECIPES = 'recipes.create',
  APPROVE_RECIPES = 'recipes.approve',
  
  // Equipment Management
  VIEW_EQUIPMENT = 'equipment.view',
  CONTROL_EQUIPMENT = 'equipment.control',
  MAINTAIN_EQUIPMENT = 'equipment.maintain',
  
  // Scheduling
  VIEW_SCHEDULE = 'schedule.view',
  EDIT_SCHEDULE = 'schedule.edit',
  
  // Quality Control
  VIEW_QUALITY = 'quality.view',
  EDIT_QUALITY = 'quality.edit',
  APPROVE_QUALITY = 'quality.approve',
  
  // Administration
  MANAGE_USERS = 'admin.users',
  SYSTEM_SETTINGS = 'admin.settings',
  VIEW_AUDIT_LOGS = 'admin.audit',
  
  // Engineering & Technology
  SYSTEM_CONFIGURATION = 'et.system_config',
  CONTROLS_ACCESS = 'et.controls',
  DEVELOPER_ACCESS = 'et.developer',
  
  // Maintenance
  MAINTENANCE_SCHEDULE = 'maintenance.schedule',
  MAINTENANCE_EXECUTE = 'maintenance.execute'
}

// Role to permissions mapping for distillery environment
export const rolePermissions: Record<ManufacturingRole, ManufacturingPermission[]> = {
  // Engineering & Technology - Admin (highest level)
  [ManufacturingRole.ET_ADMIN]: Object.values(ManufacturingPermission),
  
  // Engineering & Technology - Controls
  [ManufacturingRole.ET_CONTROLS]: [
    ManufacturingPermission.VIEW_PRODUCTION,
    ManufacturingPermission.EDIT_PRODUCTION,
    ManufacturingPermission.VIEW_RECIPES,
    ManufacturingPermission.EDIT_RECIPES,
    ManufacturingPermission.CREATE_RECIPES,
    ManufacturingPermission.VIEW_EQUIPMENT,
    ManufacturingPermission.CONTROL_EQUIPMENT,
    ManufacturingPermission.MAINTAIN_EQUIPMENT,
    ManufacturingPermission.VIEW_SCHEDULE,
    ManufacturingPermission.EDIT_SCHEDULE,
    ManufacturingPermission.VIEW_QUALITY,
    ManufacturingPermission.EDIT_QUALITY,
    ManufacturingPermission.SYSTEM_CONFIGURATION,
    ManufacturingPermission.CONTROLS_ACCESS,
    ManufacturingPermission.MAINTENANCE_SCHEDULE
  ],
  
  // Engineering & Technology - Developer
  [ManufacturingRole.ET_DEVELOPER]: [
    ManufacturingPermission.VIEW_PRODUCTION,
    ManufacturingPermission.VIEW_RECIPES,
    ManufacturingPermission.VIEW_EQUIPMENT,
    ManufacturingPermission.VIEW_SCHEDULE,
    ManufacturingPermission.VIEW_QUALITY,
    ManufacturingPermission.SYSTEM_CONFIGURATION,
    ManufacturingPermission.DEVELOPER_ACCESS,
    ManufacturingPermission.VIEW_AUDIT_LOGS
  ],
  
  // Operations - Distillery Leadership
  [ManufacturingRole.OPS_DISTILLERY_LEADERSHIP]: [
    ManufacturingPermission.VIEW_PRODUCTION,
    ManufacturingPermission.EDIT_PRODUCTION,
    ManufacturingPermission.CREATE_PRODUCTION_ORDER,
    ManufacturingPermission.APPROVE_PRODUCTION_ORDER,
    ManufacturingPermission.VIEW_RECIPES,
    ManufacturingPermission.EDIT_RECIPES,
    ManufacturingPermission.CREATE_RECIPES,
    ManufacturingPermission.APPROVE_RECIPES,
    ManufacturingPermission.VIEW_EQUIPMENT,
    ManufacturingPermission.VIEW_SCHEDULE,
    ManufacturingPermission.EDIT_SCHEDULE,
    ManufacturingPermission.VIEW_QUALITY,
    ManufacturingPermission.EDIT_QUALITY,
    ManufacturingPermission.APPROVE_QUALITY,
    ManufacturingPermission.MANAGE_USERS,
    ManufacturingPermission.VIEW_AUDIT_LOGS
  ],
  
  // Operations - Distillery Supervisor
  [ManufacturingRole.OPS_DISTILLERY_SUPERVISOR]: [
    ManufacturingPermission.VIEW_PRODUCTION,
    ManufacturingPermission.EDIT_PRODUCTION,
    ManufacturingPermission.CREATE_PRODUCTION_ORDER,
    ManufacturingPermission.VIEW_RECIPES,
    ManufacturingPermission.EDIT_RECIPES,
    ManufacturingPermission.VIEW_EQUIPMENT,
    ManufacturingPermission.VIEW_SCHEDULE,
    ManufacturingPermission.EDIT_SCHEDULE,
    ManufacturingPermission.VIEW_QUALITY,
    ManufacturingPermission.EDIT_QUALITY
  ],
  
  // Operations - Distillery Shift Lead
  [ManufacturingRole.OPS_DISTILLERY_SHIFTLEAD]: [
    ManufacturingPermission.VIEW_PRODUCTION,
    ManufacturingPermission.EDIT_PRODUCTION,
    ManufacturingPermission.VIEW_RECIPES,
    ManufacturingPermission.VIEW_EQUIPMENT,
    ManufacturingPermission.VIEW_SCHEDULE,
    ManufacturingPermission.VIEW_QUALITY,
    ManufacturingPermission.EDIT_QUALITY
  ],
  
  // Operations - Distillery Operator
  [ManufacturingRole.OPS_DISTILLERY_OPERATOR]: [
    ManufacturingPermission.VIEW_PRODUCTION,
    ManufacturingPermission.VIEW_RECIPES,
    ManufacturingPermission.VIEW_EQUIPMENT,
    ManufacturingPermission.VIEW_SCHEDULE,
    ManufacturingPermission.VIEW_QUALITY
  ],
  
  // Maintenance - Leadership
  [ManufacturingRole.MAINTENANCE_LEADERSHIP]: [
    ManufacturingPermission.VIEW_PRODUCTION,
    ManufacturingPermission.VIEW_RECIPES,
    ManufacturingPermission.VIEW_EQUIPMENT,
    ManufacturingPermission.CONTROL_EQUIPMENT,
    ManufacturingPermission.MAINTAIN_EQUIPMENT,
    ManufacturingPermission.VIEW_SCHEDULE,
    ManufacturingPermission.VIEW_QUALITY,
    ManufacturingPermission.MAINTENANCE_SCHEDULE,
    ManufacturingPermission.MAINTENANCE_EXECUTE,
    ManufacturingPermission.VIEW_AUDIT_LOGS
  ],
  
  // Maintenance - Technician
  [ManufacturingRole.MAINTENANCE_TECHNICIAN]: [
    ManufacturingPermission.VIEW_PRODUCTION,
    ManufacturingPermission.VIEW_RECIPES,
    ManufacturingPermission.VIEW_EQUIPMENT,
    ManufacturingPermission.MAINTAIN_EQUIPMENT,
    ManufacturingPermission.VIEW_SCHEDULE,
    ManufacturingPermission.VIEW_QUALITY,
    ManufacturingPermission.MAINTENANCE_EXECUTE
  ]
}

// Module-level environment variable access for Next.js webpack static analysis
// CRITICAL: Must use DOT notation (process.env.VAR), NOT bracket notation (process.env['VAR'])
// CRITICAL: Must be at MODULE LEVEL, not inside functions
// This pattern matches the working implementation in whk-wms-frontend/authConfig.js

// DEBUG: Log build-time environment variable values
console.log('🔧 auth-config.ts - Module load-time check:')
console.log('  NODE_ENV:', process.env.NODE_ENV)
console.log('  VERCEL:', process.env.VERCEL)
console.log('  VERCEL_ENV:', process.env.VERCEL_ENV)
console.log('  VERCEL_URL:', process.env.VERCEL_URL)
console.log('  NEXT_PUBLIC_AZURE_AD_CLIENT_ID:', process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID ? 'present' : 'UNDEFINED')
console.log('  NEXT_PUBLIC_AZURE_AD_TENANT_ID:', process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID ? 'present' : 'UNDEFINED')

const AZURE_CLIENT_ID = process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID
const AZURE_TENANT_ID = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID
const AZURE_AUTHORITY = process.env.NEXT_PUBLIC_AZURE_AUTHORITY
const AZURE_REDIRECT_URI = process.env.NEXT_PUBLIC_AZURE_REDIRECT_URI
const AZURE_LOGOUT_URI = process.env.NEXT_PUBLIC_AZURE_LOGOUT_URI
const DISABLE_DEV_MODE = process.env.NEXT_PUBLIC_DISABLE_DEV_MODE
const ENABLE_DEMO_USER = process.env.NEXT_PUBLIC_ENABLE_DEMO_USER
const E2E_AUTO_LOGIN = process.env.NEXT_PUBLIC_E2E_AUTO_LOGIN

console.log('  Assigned AZURE_CLIENT_ID:', AZURE_CLIENT_ID ? 'present' : 'UNDEFINED')
console.log('  Assigned AZURE_TENANT_ID:', AZURE_TENANT_ID ? 'present' : 'UNDEFINED')

// Check if Azure AD credentials are actually configured
export const isAzureActuallyConfigured = (): boolean => {
  // Use module-level constants with direct process.env access
  // Trim to handle edge cases like "value\n" from Vercel CLI
  const clientId = AZURE_CLIENT_ID?.trim()
  const tenantId = AZURE_TENANT_ID?.trim()

  console.log('🔍 Azure Configuration Check:')
  console.log('  Environment:', typeof window !== 'undefined' ? 'client' : 'server')
  console.log('  clientId:', clientId ? `present (${clientId.substring(0, 8)}...)` : 'missing')
  console.log('  tenantId:', tenantId ? `present (${tenantId.substring(0, 8)}...)` : 'missing')

  // Validate GUID format
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const clientIdValid = clientId && guidRegex.test(clientId)
  const tenantIdValid = tenantId && guidRegex.test(tenantId)

  console.log('  clientId format valid:', clientIdValid)
  console.log('  tenantId format valid:', tenantIdValid)

  const result = Boolean(clientIdValid && tenantIdValid)
  console.log('  final result:', result)

  return result
}

// Check if development mode should be disabled
export const isDevModeDisabled = (): boolean => {
  const disableDevMode = DISABLE_DEV_MODE

  console.log('isDevModeDisabled check:')
  console.log('  disableDevMode:', disableDevMode)

  // Trim whitespace and newlines (handles "true\n" edge case from Vercel CLI)
  const result = disableDevMode?.trim() === 'true'
  console.log('  result:', result)

  return result
}

// Check if demo user is enabled
export const isDemoUserEnabled = (): boolean => {
  const enableDemoUser = ENABLE_DEMO_USER

  console.log('isDemoUserEnabled check:')
  console.log('  enableDemoUser:', enableDemoUser)

  // Trim whitespace and newlines (handles "true\n" edge case from Vercel CLI)
  const result = enableDemoUser?.trim() === 'true'
  console.log('  result:', result)

  return result
}

// Check if E2E auto-login is enabled (for Playwright tests)
export const isE2EAutoLogin = (): boolean => {
  const e2eAutoLogin = E2E_AUTO_LOGIN
  // Trim whitespace and newlines
  return e2eAutoLogin?.trim() === 'true'
}

// Legacy function for backward compatibility - now uses the correct logic
export const isAzureConfigured = (): boolean => {
  // For display purposes, show "Azure Configured: Yes" if either:
  // 1. Azure is actually configured with credentials, OR
  // 2. Dev mode is explicitly disabled (meaning user wants to use Azure)
  const actuallyConfigured = isAzureActuallyConfigured()
  const devModeDisabled = isDevModeDisabled()
  
  const result = actuallyConfigured || devModeDisabled
  console.log('isAzureConfigured (legacy) result:', result)
  
  return result
}

// Generate authority URL from tenant ID
const getAuthority = (): string => {
  const tenantId = AZURE_TENANT_ID?.trim()
  if (!tenantId) {
    throw new Error('NEXT_PUBLIC_AZURE_AD_TENANT_ID is required for Azure authentication')
  }
  return `https://login.microsoftonline.com/${tenantId}`
}

// Log MSAL configuration for debugging
const logMsalConfig = () => {
  console.group('⚙️ MSAL Configuration')
  console.log('Client ID:', AZURE_CLIENT_ID ? 'configured' : 'missing')
  console.log('Authority:', AZURE_AUTHORITY || 'computed from tenant')
  console.log('Redirect URI:', AZURE_REDIRECT_URI || 'missing')
  console.log('Post Logout Redirect URI:', AZURE_LOGOUT_URI || 'missing')
  console.log('Azure Actually Configured:', isAzureActuallyConfigured())
  console.log('Dev Mode Disabled:', isDevModeDisabled())
  console.log('Demo User Enabled:', isDemoUserEnabled())
  console.groupEnd()
}

// Log configuration on module load
if (typeof window !== 'undefined') {
  logMsalConfig()
}

// Dynamic MSAL Configuration getter for Microsoft Entra ID
export const getMsalConfig = (): Configuration => {
  // Only create MSAL config on client side to avoid SSR issues
  if (typeof window === 'undefined') {
    console.log('🔧 getMsalConfig called on server side - returning minimal config')
    // Return a minimal config for SSR that won't be used
    return {
      auth: {
        clientId: 'ssr-placeholder',
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: 'http://localhost:3000',
        postLogoutRedirectUri: 'http://localhost:3000',
        navigateToLoginRequestUrl: false
      },
      cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false
      }
    }
  }

  // Trim to handle edge cases like "value\n" from Vercel CLI
  const clientId = AZURE_CLIENT_ID?.trim()

  console.log('🔧 getMsalConfig called:')
  console.log('  Environment:', typeof window !== 'undefined' ? 'client' : 'server')
  console.log('  clientId from module constant:', clientId ? `${clientId.substring(0, 8)}...` : 'EMPTY')
  console.log('  NODE_ENV:', process.env.NODE_ENV)

  // Validate that we have a proper client ID - no fallbacks to dummy values
  if (!clientId) {
    const errorMsg = '🚨 MSAL Configuration Error: NEXT_PUBLIC_AZURE_AD_CLIENT_ID is missing or empty!'
    console.error(errorMsg)
    if (typeof window !== 'undefined') {
      console.log('Available environment variables:', Object.keys(process.env).filter(k => k.startsWith('NEXT_PUBLIC_')))
    }
    throw new Error('Azure Client ID is required for authentication. Please check your environment configuration.')
  }

  console.log('  Final clientId:', clientId ? `${clientId.substring(0, 8)}...` : 'EMPTY')

  // Get required configuration values (trim to handle edge cases)
  const authority = AZURE_AUTHORITY?.trim() || getAuthority()
  const redirectUri = AZURE_REDIRECT_URI?.trim()
  const postLogoutRedirectUri = AZURE_LOGOUT_URI?.trim()

  if (!redirectUri || !postLogoutRedirectUri) {
    const errorMsg = '🚨 MSAL Configuration Error: Redirect URIs are required!'
    console.error(errorMsg)
    console.error('NEXT_PUBLIC_AZURE_REDIRECT_URI:', redirectUri || 'MISSING')
    console.error('NEXT_PUBLIC_AZURE_LOGOUT_URI:', postLogoutRedirectUri || 'MISSING')
    throw new Error('Azure redirect URIs are required for authentication. Please check your environment configuration.')
  }

  return {
    auth: {
      clientId: clientId,
      authority: authority,
      redirectUri: redirectUri,
      postLogoutRedirectUri: postLogoutRedirectUri,
      navigateToLoginRequestUrl: false
    },
    cache: {
      cacheLocation: 'localStorage', // Enhanced: Primary storage for persistence across browser sessions
      storeAuthStateInCookie: false, // Disabled for modern browsers
      secureCookies: true, // Enhanced: Enable for production security
      cacheMigrationEnabled: true, // Enhanced: Support migration from sessionStorage
      claimsBasedCachingEnabled: true // Enhanced: Optimize for role-based caching
    },
    system: {
      windowHashTimeout: 60000, // Enhanced: Increased timeout for manufacturing environment
      iframeHashTimeout: 6000,
      loadFrameTimeout: 0,
      tokenRenewalOffsetSeconds: 300, // Enhanced: Refresh 5 minutes before expiry (PRD requirement)
      navigateFrameWait: 0,
      loggerOptions: {
        loggerCallback: (level: LogLevel, message: string, containsPii: boolean) => {
          if (containsPii) return
          
          // Enhanced logging for debugging
          const timestamp = new Date().toISOString()
          const prefix = `[${timestamp}] MSAL`
          
          switch (level) {
            case LogLevel.Error:
              console.error(`${prefix} Error:`, message)
              // Additional context for errors
              if (message.includes('network')) {
                console.error('💡 Network error detected - check internet connection and Azure endpoints')
              }
              if (message.includes('authority')) {
                console.error('💡 Authority error - check tenant ID and authority URL')
              }
              if (message.includes('client_id')) {
                console.error('💡 Client ID error - check app registration in Azure Portal')
              }
              if (message.includes('token')) {
                console.error('💡 Token error - check token expiration and refresh logic')
              }
              break
            case LogLevel.Warning:
              console.warn(`${prefix} Warning:`, message)
              break
            case LogLevel.Info:
              console.info(`${prefix} Info:`, message)
              break
            case LogLevel.Verbose:
              console.debug(`${prefix} Verbose:`, message)
              break
          }
        },
        logLevel: LogLevel.Verbose, // More detailed logging for debugging
        piiLoggingEnabled: false
      }
    }
  }
}

// Login request configuration
export const loginRequest = {
  scopes: ['User.Read', 'openid', 'profile'], // Basic Microsoft Graph permissions
  prompt: 'select_account',
  extraScopesToConsent: [], // Additional scopes for consent
  // Request roles to be included in the token
  extraQueryParameters: {
    // This ensures roles are included in the ID token
    'response_mode': 'fragment',
    'response_type': 'id_token token',
    // Request group membership information for nested groups
    'claims': JSON.stringify({
      "id_token": {
        "roles": null,
        "groups": null
      }
    })
  }
}

// Silent token request configuration
export const silentRequest = {
  scopes: ['User.Read'],
  account: null as AccountInfo | null // Will be set during runtime
}

// Graph API request configuration
export const graphConfig = {
  graphMeEndpoint: 'https://graph.microsoft.com/v1.0/me',
  graphGroupsEndpoint: 'https://graph.microsoft.com/v1.0/me/memberOf'
}

// Manufacturing environment specific configuration
export const manufacturingConfig = {
  // Session timeout for factory floor (in minutes)
  sessionTimeout: 480, // 8 hours for shift work
  
  // Token refresh threshold (in minutes before expiry)
  tokenRefreshThreshold: 30,
  
  // Manufacturing roles that require elevated permissions
  elevatedRoles: [
    ManufacturingRole.ET_ADMIN, 
    ManufacturingRole.ET_CONTROLS, 
    ManufacturingRole.OPS_DISTILLERY_LEADERSHIP,
    ManufacturingRole.MAINTENANCE_LEADERSHIP
  ],
  
  // Factory-specific settings
  factory: {
    name: 'Whiskey House of Kentucky',
    timezone: 'America/New_York',
    shiftStartHour: 6, // 6 AM
    shiftEndHour: 22   // 10 PM
  }
}

export default getMsalConfig 