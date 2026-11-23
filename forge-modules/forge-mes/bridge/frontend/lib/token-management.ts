/**
 * Token Management Service for MSAL Token Persistence Enhancement
 * 
 * This service provides comprehensive token validation, integrity checks,
 * and utility functions for managing authentication tokens in the manufacturing environment.
 */

import { AccountInfo, AuthenticationResult } from '@azure/msal-browser'
import { ManufacturingRole, manufacturingConfig } from './auth-config'

// Token validation result interface
export interface TokenValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  expiresIn?: number // seconds until expiration
  needsRefresh?: boolean
}

// Token integrity check interface
export interface TokenIntegrityCheck {
  hasValidStructure: boolean
  hasValidClaims: boolean
  hasValidExpiration: boolean
  hasValidIssuer: boolean
  hasValidAudience: boolean
}

// Manufacturing-specific token claims interface
interface ManufacturingTokenClaims {
  roles?: string[]
  department?: string
  shift?: string
  iat?: number // issued at
  exp?: number // expiration
  iss?: string // issuer
  aud?: string // audience
  sub?: string // subject
  [key: string]: unknown
}

/**
 * Token Management Service Class
 */
export class TokenManagementService {
  private static instance: TokenManagementService
  private readonly TOKEN_REFRESH_THRESHOLD = manufacturingConfig.tokenRefreshThreshold * 60 // Convert to seconds

  private constructor() {}

  public static getInstance(): TokenManagementService {
    if (!TokenManagementService.instance) {
      TokenManagementService.instance = new TokenManagementService()
    }
    return TokenManagementService.instance
  }

  /**
   * Comprehensive token validation
   */
  public validateToken(account: AccountInfo | null): TokenValidationResult {
    const result: TokenValidationResult = {
      isValid: false,
      errors: [],
      warnings: []
    }

    if (!account) {
      result.errors.push('No account provided for validation')
      return result
    }

    if (!account.idTokenClaims) {
      result.errors.push('No token claims found in account')
      return result
    }

    const claims = account.idTokenClaims as ManufacturingTokenClaims

    // Check token structure and basic claims
    const integrityCheck = this.checkTokenIntegrity(claims)
    if (!integrityCheck.hasValidStructure) {
      result.errors.push('Token has invalid structure')
    }

    if (!integrityCheck.hasValidClaims) {
      result.errors.push('Token has invalid or missing required claims')
    }

    // Check token expiration
    const expirationCheck = this.checkTokenExpiration(claims)
    if (!expirationCheck.isValid) {
      if (expirationCheck.isExpired) {
        result.errors.push('Token has expired')
      } else {
        result.warnings.push('Token expiration information is invalid')
      }
    } else {
      result.expiresIn = expirationCheck.expiresIn
      result.needsRefresh = expirationCheck.needsRefresh
      
      if (expirationCheck.needsRefresh) {
        result.warnings.push(`Token expires in ${Math.round(expirationCheck.expiresIn! / 60)} minutes and needs refresh`)
      }
    }

    // Check issuer validity
    if (!integrityCheck.hasValidIssuer) {
      result.warnings.push('Token issuer validation failed')
    }

    // Check audience validity
    if (!integrityCheck.hasValidAudience) {
      result.warnings.push('Token audience validation failed')
    }

    // Manufacturing-specific validations
    const manufacturingValidation = this.validateManufacturingClaims(claims)
    if (!manufacturingValidation.isValid) {
      result.warnings.push(...manufacturingValidation.warnings)
    }

    // Overall validation result
    result.isValid = result.errors.length === 0

    console.log('🔍 Token validation result:', {
      isValid: result.isValid,
      errors: result.errors,
      warnings: result.warnings,
      expiresIn: result.expiresIn,
      needsRefresh: result.needsRefresh
    })

    return result
  }

  /**
   * Check token integrity and structure
   */
  private checkTokenIntegrity(claims: ManufacturingTokenClaims): TokenIntegrityCheck {
    const check: TokenIntegrityCheck = {
      hasValidStructure: true,
      hasValidClaims: true,
      hasValidExpiration: true,
      hasValidIssuer: true,
      hasValidAudience: true
    }

    // Check basic token structure
    if (!claims || typeof claims !== 'object') {
      check.hasValidStructure = false
      return check
    }

    // Check required claims
    const requiredClaims = ['sub', 'iat', 'exp']
    for (const claim of requiredClaims) {
      if (!claims[claim]) {
        check.hasValidClaims = false
        console.warn(`🔍 Missing required claim: ${claim}`)
      }
    }

    // Check expiration claim format
    if (claims.exp && (typeof claims.exp !== 'number' || claims.exp <= 0)) {
      check.hasValidExpiration = false
    }

    // Check issued at claim format
    if (claims.iat && (typeof claims.iat !== 'number' || claims.iat <= 0)) {
      check.hasValidClaims = false
    }

    // Check issuer format (should be Microsoft)
    if (claims.iss && typeof claims.iss === 'string') {
      const validIssuers = [
        'https://login.microsoftonline.com',
        'https://sts.windows.net'
      ]
      check.hasValidIssuer = validIssuers.some(issuer => claims.iss!.includes(issuer))
    } else {
      check.hasValidIssuer = false
    }

    // Check audience (should match our client ID)
    if (claims.aud && typeof claims.aud === 'string') {
      // In a real implementation, you'd check against your actual client ID
      check.hasValidAudience = claims.aud.length > 0
    } else {
      check.hasValidAudience = false
    }

    return check
  }

  /**
   * Check token expiration and refresh needs
   */
  private checkTokenExpiration(claims: ManufacturingTokenClaims): {
    isValid: boolean
    isExpired: boolean
    expiresIn: number
    needsRefresh: boolean
  } {
    const now = Math.floor(Date.now() / 1000) // Current time in seconds

    if (!claims.exp || typeof claims.exp !== 'number') {
      return {
        isValid: false,
        isExpired: false,
        expiresIn: 0,
        needsRefresh: false
      }
    }

    const expiresIn = claims.exp - now
    const isExpired = expiresIn <= 0
    const needsRefresh = expiresIn <= this.TOKEN_REFRESH_THRESHOLD && !isExpired

    return {
      isValid: !isExpired,
      isExpired,
      expiresIn: Math.max(0, expiresIn),
      needsRefresh
    }
  }

  /**
   * Validate manufacturing-specific claims
   */
  private validateManufacturingClaims(claims: ManufacturingTokenClaims): {
    isValid: boolean
    warnings: string[]
  } {
    const warnings: string[] = []

    // Check for manufacturing roles
    if (!claims.roles || !Array.isArray(claims.roles) || claims.roles.length === 0) {
      warnings.push('No manufacturing roles found in token claims')
    } else {
      // Validate role format
      const validRoles = Object.values(ManufacturingRole)
      const invalidRoles = claims.roles.filter(role => !validRoles.includes(role as ManufacturingRole))
      if (invalidRoles.length > 0) {
        warnings.push(`Invalid manufacturing roles found: ${invalidRoles.join(', ')}`)
      }
    }

    // Check for department information
    if (!claims.department) {
      warnings.push('No department information found in token claims')
    }

    // Check for shift information (optional but recommended for manufacturing)
    if (!claims.shift) {
      warnings.push('No shift information found in token claims (recommended for manufacturing environment)')
    }

    return {
      isValid: warnings.length === 0,
      warnings
    }
  }

  /**
   * Validate authentication result from MSAL
   */
  public validateAuthenticationResult(result: AuthenticationResult): TokenValidationResult {
    if (!result.account) {
      return {
        isValid: false,
        errors: ['Authentication result contains no account information'],
        warnings: []
      }
    }

    return this.validateToken(result.account)
  }

  /**
   * Check if token needs proactive refresh
   */
  public needsProactiveRefresh(account: AccountInfo | null): boolean {
    if (!account?.idTokenClaims) {
      return false
    }

    const claims = account.idTokenClaims as ManufacturingTokenClaims
    const expirationCheck = this.checkTokenExpiration(claims)
    
    return expirationCheck.needsRefresh
  }

  /**
   * Get time until token expiration in seconds
   */
  public getTimeUntilExpiration(account: AccountInfo | null): number {
    if (!account?.idTokenClaims) {
      return 0
    }

    const claims = account.idTokenClaims as ManufacturingTokenClaims
    const expirationCheck = this.checkTokenExpiration(claims)
    
    return expirationCheck.expiresIn
  }

  /**
   * Check if account is valid for manufacturing environment
   */
  public isValidManufacturingAccount(account: AccountInfo | null): boolean {
    const validation = this.validateToken(account)
    
    // For manufacturing environment, we require valid token with minimal warnings
    return validation.isValid && validation.warnings.length <= 2 // Allow some non-critical warnings
  }

  /**
   * Get token expiration date
   */
  public getTokenExpirationDate(account: AccountInfo | null): Date | null {
    if (!account?.idTokenClaims) {
      return null
    }

    const claims = account.idTokenClaims as ManufacturingTokenClaims
    if (!claims.exp) {
      return null
    }

    return new Date(claims.exp * 1000) // Convert from seconds to milliseconds
  }

  /**
   * Log token analytics for monitoring
   */
  public logTokenAnalytics(account: AccountInfo | null, event: string, additionalData?: Record<string, unknown>): void {
    if (!account) {
      return
    }

    const validation = this.validateToken(account)
    const expirationDate = this.getTokenExpirationDate(account)

    const analyticsData = {
      event,
      timestamp: new Date().toISOString(),
      userId: account.localAccountId || account.homeAccountId,
      username: account.username,
      tokenValid: validation.isValid,
      tokenErrors: validation.errors,
      tokenWarnings: validation.warnings,
      expiresIn: validation.expiresIn,
      needsRefresh: validation.needsRefresh,
      expirationDate: expirationDate?.toISOString(),
      ...additionalData
    }

    console.log('📊 Token Analytics:', analyticsData)

    // In a real implementation, you would send this to your analytics service
    // Example: analyticsService.track('token_event', analyticsData)
  }

  /**
   * Comprehensive localStorage inspection for MSAL token debugging
   * This helps diagnose token persistence issues by examining what's actually stored
   */
  public inspectLocalStorageTokens(): {
    hasTokens: boolean
    tokenCount: number
    tokens: Array<{
      key: string
      type: 'account' | 'idtoken' | 'accesstoken' | 'refreshtoken' | 'clientinfo' | 'unknown'
      isExpired?: boolean
      expiresIn?: number
      expirationDate?: string
      claims?: Record<string, unknown>
      size: number
      accountId?: string
      username?: string
    }>
    summary: {
      totalSize: number
      hasValidTokens: boolean
      hasExpiredTokens: boolean
      oldestToken?: string
      newestToken?: string
    }
  } {
    const result: {
      hasTokens: boolean
      tokenCount: number
      tokens: Array<{
        key: string
        type: 'account' | 'idtoken' | 'accesstoken' | 'refreshtoken' | 'clientinfo' | 'unknown'
        isExpired?: boolean
        expiresIn?: number
        expirationDate?: string
        claims?: Record<string, unknown>
        size: number
        accountId?: string
        username?: string
      }>
      summary: {
        totalSize: number
        hasValidTokens: boolean
        hasExpiredTokens: boolean
        oldestToken?: string
        newestToken?: string
      }
    } = {
      hasTokens: false,
      tokenCount: 0,
      tokens: [],
      summary: {
        totalSize: 0,
        hasValidTokens: false,
        hasExpiredTokens: false
      }
    }

    if (typeof window === 'undefined') {
      console.log('🔍 localStorage inspection skipped - running on server side')
      return result
    }

    try {
      console.group('🔍 MSAL localStorage Token Inspection')
      
      // Get all MSAL-related keys - MSAL uses various patterns
      const msalKeys = Object.keys(localStorage).filter(key => 
        key.toLowerCase().includes('msal') || 
        key.includes('3238411a-cc4b-420c-91d8-14ff6e99d60b') || // client ID
        key.includes('1f456c44-0bff-47fd-8bfd-9d8fe7dcf07a') ||   // tenant ID
        key.includes('.cache.') ||                                // MSAL cache pattern
        key.includes('authority.') ||                             // Authority cache
        key.includes('account.') ||                               // Account cache
        key.includes('idtoken.') ||                               // ID token cache
        key.includes('accesstoken.') ||                           // Access token cache
        key.includes('refreshtoken.')                             // Refresh token cache
      )
      result.hasTokens = msalKeys.length > 0
      result.tokenCount = msalKeys.length

      console.log(`Found ${msalKeys.length} MSAL-related keys in localStorage:`)
      console.log('Keys:', msalKeys)
      
      let oldestTimestamp = Infinity
      let newestTimestamp = 0
      
      for (const key of msalKeys) {
        try {
          const value = localStorage.getItem(key)
          if (!value) continue

          const tokenInfo: {
            key: string
            type: 'account' | 'idtoken' | 'accesstoken' | 'refreshtoken' | 'clientinfo' | 'unknown'
            size: number
            isExpired?: boolean
            expiresIn?: number
            expirationDate?: string
            claims?: Record<string, unknown>
            accountId?: string
            username?: string
          } = {
            key,
            type: this.getTokenType(key),
            size: value.length
          }

          result.summary.totalSize += value.length

          // Try to parse the token data
          try {
            const parsed = JSON.parse(value)
            
            // Handle different token types
            if (tokenInfo.type === 'idtoken' || tokenInfo.type === 'accesstoken') {
              // MSAL cache structure can vary - check multiple possible fields
              let tokenValue: string | null = null
              
              // Try different possible token fields
              if (typeof parsed === 'string' && parsed.includes('.')) {
                tokenValue = parsed
              } else if (parsed.secret && typeof parsed.secret === 'string') {
                tokenValue = parsed.secret
              } else if (parsed.credential && typeof parsed.credential === 'string') {
                tokenValue = parsed.credential
              } else if (parsed.token && typeof parsed.token === 'string') {
                tokenValue = parsed.token
              } else if (parsed.id_token && typeof parsed.id_token === 'string') {
                tokenValue = parsed.id_token
              } else if (parsed.access_token && typeof parsed.access_token === 'string') {
                tokenValue = parsed.access_token
              }
              
              if (tokenValue && tokenValue.includes('.')) {
                // Decode the JWT token to get claims
                const claims = this.decodeJWTClaims(tokenValue)
                if (claims) {
                  tokenInfo.claims = claims
                  
                  // Check expiration
                  const exp = claims['exp']
                  if (exp && typeof exp === 'number') {
                    const now = Math.floor(Date.now() / 1000)
                    const expiresIn = exp - now
                    tokenInfo.isExpired = expiresIn <= 0
                    tokenInfo.expiresIn = expiresIn
                    tokenInfo.expirationDate = new Date(exp * 1000).toISOString()
                    
                    if (tokenInfo.isExpired) {
                      result.summary.hasExpiredTokens = true
                    } else {
                      result.summary.hasValidTokens = true
                    }
                  } else {
                    // If no expiration found, assume it's valid for now
                    result.summary.hasValidTokens = true
                  }

                  // Track oldest/newest tokens
                  const iat = claims['iat']
                  if (iat && typeof iat === 'number') {
                    if (iat < oldestTimestamp) {
                      oldestTimestamp = iat
                      result.summary.oldestToken = new Date(iat * 1000).toISOString()
                    }
                    if (iat > newestTimestamp) {
                      newestTimestamp = iat
                      result.summary.newestToken = new Date(iat * 1000).toISOString()
                    }
                  }
                  
                  // Extract user info from claims
                  tokenInfo.username = claims['preferred_username'] as string || claims['upn'] as string || claims['email'] as string
                  tokenInfo.accountId = claims['oid'] as string || claims['sub'] as string
                }
              } else {
                // Even if we can't decode the token, if it exists it might be valid
                console.log(`Found ${tokenInfo.type} but couldn't decode JWT. Raw structure:`, Object.keys(parsed))
                if (Object.keys(parsed).length > 0) {
                  result.summary.hasValidTokens = true
                }
              }
            }

            // Check if it's an account with user info
            if (tokenInfo.type === 'account') {
              tokenInfo.accountId = parsed.localAccountId || parsed.homeAccountId
              tokenInfo.username = parsed.username || parsed.name
              
              // Account entries are generally valid if they have required fields
              if (tokenInfo.accountId) {
                result.summary.hasValidTokens = true
              }
            }
            
            // Check refresh tokens
            if (tokenInfo.type === 'refreshtoken') {
              // Refresh tokens don't have expiration in the token itself
              // but if we have the token, it's potentially valid
              if (parsed.secret || parsed.credential) {
                result.summary.hasValidTokens = true
              }
            }

          } catch (parseError) {
            console.warn(`Failed to parse token data for key: ${key}`, parseError)
          }

          result.tokens.push(tokenInfo)

          // Log detailed token info
          console.log(`📄 ${tokenInfo.type.toUpperCase()} Token:`, {
            key: key.substring(0, 50) + '...',
            type: tokenInfo.type,
            size: `${Math.round(tokenInfo.size / 1024 * 100) / 100}KB`,
            isExpired: tokenInfo.isExpired,
            expiresIn: tokenInfo.expiresIn ? `${Math.round(tokenInfo.expiresIn / 60)}min` : undefined,
            expirationDate: tokenInfo.expirationDate,
            username: tokenInfo.username,
            accountId: tokenInfo.accountId
          })

        } catch (error) {
          console.error(`Error inspecting token key: ${key}`, error)
        }
      }

      // Summary
      console.log('📊 Token Storage Summary:', {
        totalTokens: result.tokenCount,
        totalSize: `${Math.round(result.summary.totalSize / 1024 * 100) / 100}KB`,
        hasValidTokens: result.summary.hasValidTokens,
        hasExpiredTokens: result.summary.hasExpiredTokens,
        oldestToken: result.summary.oldestToken,
        newestToken: result.summary.newestToken
      })

      if (result.summary.hasExpiredTokens) {
        console.warn('⚠️ Found expired tokens in localStorage - these should be cleaned up')
      }

      if (!result.summary.hasValidTokens && result.hasTokens) {
        console.warn('⚠️ Found MSAL tokens but none are valid - user may need to re-authenticate')
      }

      if (result.summary.hasValidTokens) {
        console.log('✅ Found valid tokens in localStorage - token persistence is working')
      }

    } catch (error) {
      console.error('Error during localStorage inspection:', error)
    } finally {
      console.groupEnd()
    }

    return result
  }

  /**
   * Determine token type from localStorage key
   */
  private getTokenType(key: string): 'account' | 'idtoken' | 'accesstoken' | 'refreshtoken' | 'clientinfo' | 'unknown' {
    const lowerKey = key.toLowerCase()
    
    // MSAL v2+ uses different key patterns - check for actual cache entries first
    // Pattern: {homeAccountId}.{environment}-{realm}-{clientId}-{scopes}-{credentialType}
    if (key.includes('-login.') || key.includes('-idtoken.')) return 'idtoken'
    if (key.includes('-accesstoken.') || key.includes('-accesstoken-')) return 'accesstoken'
    if (key.includes('-refreshtoken.') || key.includes('-refreshtoken-')) return 'refreshtoken'
    
    // Legacy MSAL patterns
    if (lowerKey.includes('account') || lowerKey.includes('.cache.accounts.')) return 'account'
    if (lowerKey.includes('idtoken') || lowerKey.includes('.cache.idtokens.')) return 'idtoken'
    if (lowerKey.includes('accesstoken') || lowerKey.includes('.cache.accesstokens.')) return 'accesstoken'
    if (lowerKey.includes('refreshtoken') || lowerKey.includes('.cache.refreshtokens.')) return 'refreshtoken'
    if (lowerKey.includes('client.info') || lowerKey.includes('clientinfo')) return 'clientinfo'
    
    // MSAL metadata keys
    if (lowerKey.includes('msal.account.keys')) return 'account'
    if (lowerKey.includes('msal.token.keys')) return 'clientinfo'
    if (lowerKey.includes('msal_cross_tab_sync')) return 'clientinfo'
    if (lowerKey.includes('msal.') && lowerKey.includes('authority')) return 'clientinfo'
    if (lowerKey.includes('msal.') && lowerKey.includes('telemetry')) return 'clientinfo'
    
    return 'unknown'
  }

  /**
   * Decode JWT token claims (simple base64 decode)
   */
  private decodeJWTClaims(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) return null

      // Decode the payload (second part)
      const payload = parts[1]
      if (!payload) return null
      
      // Add padding if needed
      const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4)
      const decoded = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'))
      return JSON.parse(decoded) as Record<string, unknown>
    } catch (error) {
      console.warn('Failed to decode JWT claims:', error)
      return null
    }
  }

  /**
   * Clean up expired tokens from localStorage
   */
  public cleanupExpiredTokens(): { removedCount: number; remainingCount: number } {
    let removedCount = 0
    let remainingCount = 0

    if (typeof window === 'undefined') {
      return { removedCount: 0, remainingCount: 0 }
    }

    try {
      console.log('🧹 Starting expired token cleanup...')
      
      const msalKeys = Object.keys(localStorage).filter(key => key.includes('msal'))
      
      for (const key of msalKeys) {
        try {
          const value = localStorage.getItem(key)
          if (!value) continue

          // Check if it's an ID token
          if (key.includes('idtoken')) {
            const parsed = JSON.parse(value)
            if (parsed.secret) {
              const claims = this.decodeJWTClaims(parsed.secret)
              const exp = claims?.['exp']
              if (claims && exp && typeof exp === 'number') {
                const now = Math.floor(Date.now() / 1000)
                const isExpired = exp <= now
                
                if (isExpired) {
                  localStorage.removeItem(key)
                  removedCount++
                  console.log(`🗑️ Removed expired token: ${key.substring(0, 50)}...`)
                } else {
                  remainingCount++
                }
              } else {
                remainingCount++
              }
            } else {
              remainingCount++
            }
          } else {
            remainingCount++
          }
        } catch (error) {
          console.warn(`Error checking token expiration for key: ${key}`, error)
          remainingCount++
        }
      }

      console.log(`🧹 Token cleanup complete: removed ${removedCount}, remaining ${remainingCount}`)
      
    } catch (error) {
      console.error('Error during token cleanup:', error)
    }

    return { removedCount, remainingCount }
  }
}

// Export singleton instance
export const tokenManager = TokenManagementService.getInstance()

// Export utility functions for convenience
export const validateToken = (account: AccountInfo | null) => tokenManager.validateToken(account)
export const needsProactiveRefresh = (account: AccountInfo | null) => tokenManager.needsProactiveRefresh(account)
export const getTimeUntilExpiration = (account: AccountInfo | null) => tokenManager.getTimeUntilExpiration(account)
export const isValidManufacturingAccount = (account: AccountInfo | null) => tokenManager.isValidManufacturingAccount(account)
export const logTokenAnalytics = (account: AccountInfo | null, event: string, additionalData?: Record<string, unknown>) => 
  tokenManager.logTokenAnalytics(account, event, additionalData) 