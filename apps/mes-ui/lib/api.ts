import { ApiResponse, PaginatedResponse } from '@/types'
import { jwtAuthService } from './auth/jwt-auth'

// API Configuration
const API_BASE_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001/api'
const GRAPHQL_URL = process.env['NEXT_PUBLIC_GRAPHQL_URL'] || 'http://localhost:3001/graphql'

/**
 * Get JWT token specifically for backend API calls
 * This is separate from MSAL authentication and only handles JWT tokens
 */
const getJWTToken = (): string | null => {
  return jwtAuthService.getToken()
}

// Generic API client for REST endpoints
class ApiClient {
  private baseURL: string

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    }

    // Add JWT token if available (for backend authentication)
    const jwtToken = getJWTToken()
    if (jwtToken) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${jwtToken}`,
      }
    }

    try {
      const response = await fetch(url, config)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      return data
    } catch (error) {
      console.error('API request failed:', error)
      throw error
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' })
  }

  async post<T>(endpoint: string, data: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async put<T>(endpoint: string, data: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async patch<T>(endpoint: string, data: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' })
  }

  // Paginated requests
  async getPaginated<T>(
    endpoint: string,
    page: number = 1,
    limit: number = 10
  ): Promise<PaginatedResponse<T>> {
    const url = `${endpoint}?page=${page}&limit=${limit}`
    const response = await this.get<T[]>(url)
    
    // Assuming the API returns pagination info in headers or response
    return {
      data: response.data,
      pagination: {
        page,
        limit,
        total: 0, // This should come from API response
        totalPages: 0, // This should come from API response
      },
    }
  }
}

// GraphQL client utility
export class GraphQLClient {
  private url: string

  constructor(url: string = GRAPHQL_URL) {
    this.url = url
  }

  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const jwtToken = getJWTToken()
    
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(jwtToken && { Authorization: `Bearer ${jwtToken}` }),
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    })

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.statusText}`)
    }

    const result = await response.json()

    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`)
    }

    return result.data
  }
}

// Export singleton instances
export const apiClient = new ApiClient()
export const graphqlClient = new GraphQLClient()

// Utility functions for common API patterns
export const createApiHook = <T>(endpoint: string) => {
  return {
    get: () => apiClient.get<T>(endpoint),
    post: (data: unknown) => apiClient.post<T>(endpoint, data),
    put: (data: unknown) => apiClient.put<T>(endpoint, data),
    patch: (data: unknown) => apiClient.patch<T>(endpoint, data),
    delete: () => apiClient.delete<T>(endpoint),
  }
}

// Error handling utilities
export const handleApiError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return 'An unexpected error occurred'
}

export const isApiError = (error: unknown): error is Error => {
  return error instanceof Error
} 