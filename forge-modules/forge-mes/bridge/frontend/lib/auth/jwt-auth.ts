import { getCurrentBackendConfig } from '../../config/backend'

// JWT Authentication Response Interface
export interface JWTAuthResponse {
  accessToken: string
  id: string
  username: string
  roles: string[]
}

// JWT User Interface
export interface JWTUser {
  id: string
  username: string
  roles: string[]
  permissions: Array<{
    resource: string
    action: string
  }>
}

// JWT Payload Interface
interface JWTPayload {
  sub?: string
  username?: string
  iat?: number
  exp?: number
  [key: string]: unknown
}

// JWT Authentication Service
export class JWTAuthService {
  private static instance: JWTAuthService
  private backendConfig = getCurrentBackendConfig()

  private constructor() {}

  public static getInstance(): JWTAuthService {
    if (!JWTAuthService.instance) {
      JWTAuthService.instance = new JWTAuthService()
    }
    return JWTAuthService.instance
  }

  /**
   * Login with username and password
   */
  public async login(username: string, password: string): Promise<JWTAuthResponse> {
    const loginUrl = `${this.backendConfig.apiUrl.replace('/api', '')}/api/login`
    
    console.log('🔐 JWT Login attempt:', { username, loginUrl })

    try {
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `Login failed: ${response.status} ${response.statusText}`)
      }

      const authData: JWTAuthResponse = await response.json()
      
      console.log('🔐 JWT Login successful:', { 
        username: authData.username, 
        roles: authData.roles,
        tokenLength: authData.accessToken.length 
      })

      // Store token in localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('jwt_token', authData.accessToken)
        localStorage.setItem('jwt_user', JSON.stringify({
          id: authData.id,
          username: authData.username,
          roles: authData.roles,
        }))
      }

      return authData
    } catch (error) {
      console.error('🔐 JWT Login failed:', error)
      throw error
    }
  }

  /**
   * Logout and clear stored tokens
   */
  public logout(): void {
    console.log('🔐 JWT Logout')
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem('jwt_token')
      localStorage.removeItem('jwt_user')
    }
  }

  /**
   * Get stored JWT token
   */
  public getToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('jwt_token')
  }

  /**
   * Convert simple role strings to ManufacturingRole enum values
   */
  private mapToManufacturingRoles(roles: string[]): string[] {
    const roleMapping: Record<string, string> = {
      'admin': 'e&t.admin', // Maps to ManufacturingRole.ET_ADMIN
      'supervisor': 'operations.distillery.supervisor', // Maps to ManufacturingRole.OPS_DISTILLERY_SUPERVISOR
      'operator': 'operations.distillery.operator', // Maps to ManufacturingRole.OPS_DISTILLERY_OPERATOR
      'user': 'operations.distillery.operator', // Default user to operator
      'mes': 'operations.distillery.supervisor', // MES user gets supervisor role
      'maintenance': 'maintenance.technician', // Maps to ManufacturingRole.MAINTENANCE_TECHNICIAN
      'developer': 'e&t.developer' // Maps to ManufacturingRole.ET_DEVELOPER
    }

    return roles.map(role => {
      const mappedRole = roleMapping[role.toLowerCase()]
      if (mappedRole) {
        console.log(`🔐 Mapped JWT role "${role}" to ManufacturingRole "${mappedRole}"`)
        return mappedRole
      }
      console.warn(`🔐 Unknown JWT role "${role}", defaulting to operator`)
      return roleMapping['operator'] // Default to operator
    }).filter((role): role is string => role !== undefined)
  }

  /**
   * Get stored user data
   */
  public getUser(): JWTUser | null {
    if (typeof window === 'undefined') return null
    
    const userStr = localStorage.getItem('jwt_user')
    if (!userStr) return null

    try {
      const userData = JSON.parse(userStr)
      
      // Map simple roles to ManufacturingRole enum values
      const mappedRoles = this.mapToManufacturingRoles(userData.roles || [])
      
      // Convert roles to permissions (basic mapping)
      const permissions = this.rolesToPermissions(mappedRoles)
      
      return {
        ...userData,
        roles: mappedRoles, // Use mapped roles
        permissions,
      }
    } catch (error) {
      console.error('🔐 Failed to parse stored user data:', error)
      return null
    }
  }

  /**
   * Check if user is authenticated
   */
  public isAuthenticated(): boolean {
    const token = this.getToken()
    if (!token) return false

    // Basic token validation (check if it's not expired)
    try {
      const payload = this.decodeJWTPayload(token)
      if (!payload || !payload.exp) return false

      const now = Math.floor(Date.now() / 1000)
      return payload.exp > now
    } catch (error) {
      console.error('🔐 Token validation failed:', error)
      return false
    }
  }

  /**
   * Decode JWT payload (without verification)
   */
  private decodeJWTPayload(token: string): JWTPayload | null {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) return null

      const payload = parts[1]
      if (!payload) return null
      
      const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4)
      const decoded = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'))
      return JSON.parse(decoded) as JWTPayload
    } catch (error) {
      console.error('🔐 Failed to decode JWT payload:', error)
      return null
    }
  }

  /**
   * Convert roles to permissions (basic mapping)
   */
  private rolesToPermissions(roles: string[]): Array<{ resource: string; action: string }> {
    const permissions: Array<{ resource: string; action: string }> = []

    roles.forEach(role => {
      switch (role.toLowerCase()) {
        case 'admin':
          permissions.push(
            { resource: '*', action: '*' },
            { resource: 'recipes', action: 'read' },
            { resource: 'recipes', action: 'write' },
            { resource: 'recipes', action: 'delete' },
            { resource: 'production', action: 'read' },
            { resource: 'production', action: 'write' },
            { resource: 'scheduling', action: 'read' },
            { resource: 'scheduling', action: 'write' },
            { resource: 'configuration', action: 'read' },
            { resource: 'configuration', action: 'write' }
          )
          break
        case 'user':
          permissions.push(
            { resource: 'recipes', action: 'read' },
            { resource: 'production', action: 'read' },
            { resource: 'scheduling', action: 'read' }
          )
          break
        case 'operator':
          permissions.push(
            { resource: 'production', action: 'read' },
            { resource: 'production', action: 'write' },
            { resource: 'recipes', action: 'read' }
          )
          break
        case 'supervisor':
          permissions.push(
            { resource: 'recipes', action: 'read' },
            { resource: 'recipes', action: 'write' },
            { resource: 'production', action: 'read' },
            { resource: 'production', action: 'write' },
            { resource: 'scheduling', action: 'read' },
            { resource: 'scheduling', action: 'write' }
          )
          break
      }
    })

    return permissions
  }

  /**
   * Refresh token if needed (placeholder for future implementation)
   */
  public async refreshToken(): Promise<string | null> {
    // TODO: Implement token refresh if the backend supports it
    console.log('🔐 Token refresh not implemented yet')
    return null
  }
}

// Export singleton instance
export const jwtAuthService = JWTAuthService.getInstance() 