import { useAuth } from '@/lib/auth-context'

/**
 * Utility function to get the current user's email for audit trails
 * Returns the logged-in user's email from Entra ID or a fallback value
 */
export function getCurrentUserEmail(): string {
  // This function should be used within React components that have access to useAuth
  // For non-React contexts, use getCurrentUserEmailFromAuth
  throw new Error('getCurrentUserEmail() must be used within a React component. Use getCurrentUserEmailFromAuth() for non-React contexts.')
}

/**
 * Hook to get the current user's email for audit trails
 * Returns the logged-in user's email from Entra ID or a fallback value
 */
export function useCurrentUserEmail(): string {
  const { user } = useAuth()
  return user?.email || 'unknown-user'
}

/**
 * Get user email from auth context (for use outside React components)
 * Note: This should be passed as a parameter to service functions
 */
export function getCurrentUserEmailFromAuth(user: { email?: string } | null | undefined): string {
  return user?.email || 'unknown-user'
}

/**
 * Interface for mutations that require user context
 */
export interface UserContextMutation {
  createdBy?: string
  updatedBy?: string
}

/**
 * Add user context to create mutation data
 */
export function addCreateUserContext<T extends Record<string, unknown>>(
  data: T,
  userEmail: string
): T & { createdBy: string } {
  return {
    ...data,
    createdBy: userEmail
  }
}

/**
 * Add user context to update mutation data
 */
export function addUpdateUserContext<T extends Record<string, unknown>>(
  data: T,
  userEmail: string
): T & { updatedBy: string } {
  return {
    ...data,
    updatedBy: userEmail
  }
}

/**
 * Type guard to check if an object has user context fields
 */
export function hasUserContext(obj: unknown): obj is UserContextMutation {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    ('createdBy' in obj || 'updatedBy' in obj)
  )
} 