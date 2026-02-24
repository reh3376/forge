import { Socket } from 'socket.io'
import jwt, { JwtPayload } from 'jsonwebtoken'

export interface AuthenticatedSocket extends Socket {
  userId?: string
  username?: string
  roles?: string[]
  isDemo?: boolean
}

export interface SocketAuthData {
  userId: string
  username: string
  roles: string[]
  isDemo: boolean
}

interface DecodedJWT extends JwtPayload {
  sub?: string
  id?: string
  userId?: string
  username?: string
  name?: string
  roles?: string[]
  role?: string
}

/**
 * Socket.IO authentication middleware
 * Validates JWT tokens or demo mode authentication
 */
export function createSocketAuthMiddleware(options: {
  jwtSecret?: string
  allowDemo?: boolean
  requireAuth?: boolean
} = {}) {
  const { 
    jwtSecret = process.env['JWT_SECRET'] || 'your-secret-key',
    allowDemo = process.env.NODE_ENV === 'development',
    requireAuth = true
  } = options

  return (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
    try {
      console.log('🔐 Socket.IO auth middleware - validating connection:', socket.id)
      
      // Extract token from handshake auth or query
      const token = socket.handshake.auth?.['token'] || 
                   socket.handshake.query?.['token'] ||
                   (socket.handshake.headers?.authorization as string)?.replace('Bearer ', '')

      // Extract demo mode headers
      const isDemoMode = socket.handshake.headers['x-demo-user'] === 'true'
      const demoUserId = socket.handshake.headers['x-demo-user-id'] as string
      const demoUserRole = socket.handshake.headers['x-demo-user-role'] as string
      const isDemoAuth = socket.handshake.headers['x-demo-authenticated'] === 'true'

      console.log('🔐 Auth data received:', {
        hasToken: !!token,
        isDemoMode,
        demoUserId,
        demoUserRole,
        isDemoAuth,
        allowDemo,
        requireAuth
      })

      // Handle demo mode authentication
      if (allowDemo && isDemoMode) {
        console.log('🔐 Demo mode authentication')
        
        if (isDemoAuth && demoUserId && demoUserRole) {
          // Authenticated demo user
          socket.userId = demoUserId
          socket.username = demoUserId
          socket.roles = [demoUserRole]
          socket.isDemo = true
          console.log('🔐 Demo user authenticated:', { userId: demoUserId, role: demoUserRole })
          return next()
        } else if (!requireAuth) {
          // Unauthenticated demo mode (if auth not required)
          socket.userId = 'demo-user-supervisor'
          socket.username = 'demo-user-supervisor'
          socket.roles = ['OPS_DISTILLERY_SUPERVISOR']
          socket.isDemo = true
          console.log('🔐 Demo mode - no auth required')
          return next()
        }
      }

      // Handle JWT token authentication
      if (token) {
        try {
          console.log('🔐 Validating JWT token')
          const decoded = jwt.verify(token, jwtSecret) as DecodedJWT
          
          const userId = decoded.sub || decoded.id || decoded.userId
          const username = decoded.username || decoded.name || decoded.sub
          
          if (userId) {
            socket.userId = userId
          }
          if (username) {
            socket.username = username
          }
          socket.roles = decoded.roles || (decoded.role ? [decoded.role] : [])
          socket.isDemo = false
          
          console.log('🔐 JWT token validated:', {
            userId: socket.userId,
            username: socket.username,
            roles: socket.roles
          })
          
          return next()
        } catch (jwtError) {
          console.error('🔐 JWT validation failed:', jwtError)
          if (requireAuth) {
            return next(new Error('Invalid authentication token'))
          }
        }
      }

      // If we reach here and auth is required, reject the connection
      if (requireAuth) {
        console.error('🔐 Authentication required but not provided')
        return next(new Error('Authentication required'))
      }

      // Allow unauthenticated connections if auth is not required
      console.log('🔐 Allowing unauthenticated connection (auth not required)')
      socket.isDemo = true
      next()

    } catch (error) {
      console.error('🔐 Socket auth middleware error:', error)
      next(new Error('Authentication failed'))
    }
  }
}

/**
 * Extract authentication data from socket
 */
export function getSocketAuthData(socket: AuthenticatedSocket): SocketAuthData | null {
  if (!socket.userId) {
    return null
  }

  return {
    userId: socket.userId,
    username: socket.username || socket.userId,
    roles: socket.roles || [],
    isDemo: socket.isDemo || false
  }
}

/**
 * Check if socket has required role
 */
export function hasRole(socket: AuthenticatedSocket, requiredRole: string): boolean {
  return socket.roles?.includes(requiredRole) || false
}

/**
 * Check if socket has any of the required roles
 */
export function hasAnyRole(socket: AuthenticatedSocket, requiredRoles: string[]): boolean {
  if (!socket.roles) return false
  return requiredRoles.some(role => socket.roles!.includes(role))
}

/**
 * Middleware to check role authorization for specific events
 */
export function requireRole(requiredRole: string) {
  return (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
    if (hasRole(socket, requiredRole)) {
      next()
    } else {
      next(new Error(`Role '${requiredRole}' required`))
    }
  }
}

/**
 * Middleware to check if user has any of the required roles
 */
export function requireAnyRole(requiredRoles: string[]) {
  return (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
    if (hasAnyRole(socket, requiredRoles)) {
      next()
    } else {
      next(new Error(`One of roles [${requiredRoles.join(', ')}] required`))
    }
  }
} 