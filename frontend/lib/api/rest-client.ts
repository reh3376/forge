import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { getAuthToken } from '../auth-utils'

// Extend AxiosRequestConfig to include metadata
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    metadata?: {
      startTime: number
    }
    _retry?: boolean
    _retryCount?: number
  }
}

// API Configuration
const API_CONFIG = {
  baseURL: process.env['NEXT_PUBLIC_API_BASE_URL'] || 'http://localhost:3000/api',
  timeout: 30000, // 30 seconds for factory network conditions
  retries: 3,
  retryDelay: 1000,
}

// Request/Response types
interface ApiResponse<T = any> {
  success: boolean
  data: T
  message?: string
  error?: string
  timestamp: string
}

interface ApiError {
  message: string
  code?: string
  details?: Record<string, any>
  timestamp: string
}

// Create axios instance
const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: API_CONFIG.baseURL,
    timeout: API_CONFIG.timeout,
    headers: {
      'Content-Type': 'application/json',
    },
  })

  // Request interceptor for auth and logging
  client.interceptors.request.use(
    async (config) => {
      // Add authorization header if token exists
      try {
        const token = await getAuthToken()
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
      } catch (error) {
        console.warn('Failed to get auth token for REST API request:', error)
        // Continue without token - let the backend handle auth errors
      }

      // Add request timestamp for debugging
      config.metadata = { startTime: Date.now() }

      // Log request in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`)
      }

      return config
    },
    (error) => {
      console.error('Request interceptor error:', error)
      return Promise.reject(error)
    }
  )

  // Response interceptor for error handling and logging
  client.interceptors.response.use(
    (response: AxiosResponse<ApiResponse>) => {
      // Log response time in development
      if (process.env.NODE_ENV === 'development' && response.config.metadata) {
        const duration = Date.now() - response.config.metadata.startTime
        console.log(`API Response: ${response.config.method?.toUpperCase()} ${response.config.url} (${duration}ms)`)
      }

      // Handle API error responses with success: false
      if (response.data && !response.data.success) {
        const error = new Error(response.data.error || 'API request failed')
        error.name = 'ApiError'
        throw error
      }

      return response
    },
    async (error) => {
      const originalRequest = error.config

      // Log error details
      console.error('API Error:', {
        url: originalRequest?.url,
        method: originalRequest?.method,
        status: error.response?.status,
        message: error.message,
      })

      // Handle authentication errors
      if (error.response?.status === 401) {
        // Log the authentication error but don't force redirect
        // Let the RouteGuard and auth context handle authentication state
        console.warn('API Authentication failed:', {
          url: originalRequest?.url,
          method: originalRequest?.method,
          status: 401
        })
        
        // Only redirect if we're not already on a protected route
        // This prevents conflicts with RouteGuard
        const currentPath = window.location.pathname
        const isProtectedRoute = currentPath.startsWith('/configuration') || 
                                currentPath.startsWith('/dashboard') ||
                                currentPath.startsWith('/recipe-management') ||
                                currentPath.startsWith('/scheduling')
        
        if (!isProtectedRoute) {
          window.location.href = '/'
        }
        
        return Promise.reject(error)
      }

      // Retry logic for network errors
      if (
        !originalRequest._retry &&
        originalRequest._retryCount < API_CONFIG.retries &&
        (error.code === 'NETWORK_ERROR' || error.response?.status >= 500)
      ) {
        originalRequest._retry = true
        originalRequest._retryCount = (originalRequest._retryCount || 0) + 1

        // Exponential backoff
        const delay = API_CONFIG.retryDelay * Math.pow(2, originalRequest._retryCount - 1)
        await new Promise(resolve => setTimeout(resolve, delay))

        return client(originalRequest)
      }

      return Promise.reject(error)
    }
  )

  return client
}

// Create the main API client instance
export const apiClient = createApiClient()

// REST API endpoints
export const restApi = {
  // Recipe Management
  recipes: {
    getAll: () => apiClient.get<ApiResponse<any[]>>('/recipes'),
    getById: (id: string) => apiClient.get<ApiResponse<any>>(`/recipes/${id}`),
    create: (data: any) => apiClient.post<ApiResponse<any>>('/recipes', data),
    update: (id: string, data: any) => apiClient.put<ApiResponse<any>>(`/recipes/${id}`, data),
    delete: (id: string) => apiClient.delete<ApiResponse<void>>(`/recipes/${id}`),
    getVersions: (id: string) => apiClient.get<ApiResponse<any[]>>(`/recipes/${id}/versions`),
    getBillOfMaterials: (id: string) => apiClient.get<ApiResponse<any[]>>(`/recipes/${id}/bom`),
    updateBillOfMaterials: (id: string, bom: any[]) => 
      apiClient.put<ApiResponse<any[]>>(`/recipes/${id}/bom`, { items: bom }),
  },

  // Production Orders
  productionOrders: {
    getAll: (params?: { status?: string; startDate?: string; endDate?: string }) => 
      apiClient.get<ApiResponse<any[]>>('/production-orders', { params }),
    getById: (id: string) => apiClient.get<ApiResponse<any>>(`/production-orders/${id}`),
    create: (data: any) => apiClient.post<ApiResponse<any>>('/production-orders', data),
    update: (id: string, data: any) => 
      apiClient.put<ApiResponse<any>>(`/production-orders/${id}`, data),
    updateStatus: (id: string, status: string) => 
      apiClient.patch<ApiResponse<any>>(`/production-orders/${id}/status`, { status }),
    delete: (id: string) => apiClient.delete<ApiResponse<void>>(`/production-orders/${id}`),
    schedule: (id: string, scheduleData: any) => 
      apiClient.post<ApiResponse<any>>(`/production-orders/${id}/schedule`, scheduleData),
  },

  // Batch Management
  batches: {
    getAll: (params?: { status?: string; recipeId?: string; productionOrderId?: string }) => 
      apiClient.get<ApiResponse<any[]>>('/batches', { params }),
    getById: (id: string) => apiClient.get<ApiResponse<any>>(`/batches/${id}`),
    create: (data: any) => apiClient.post<ApiResponse<any>>('/batches', data),
    update: (id: string, data: any) => apiClient.put<ApiResponse<any>>(`/batches/${id}`, data),
    updateStatus: (id: string, status: string) => 
      apiClient.patch<ApiResponse<any>>(`/batches/${id}/status`, { status }),
    updateMetrics: (id: string, metrics: any) => 
      apiClient.patch<ApiResponse<any>>(`/batches/${id}/metrics`, { metrics }),
    getActiveBatches: () => apiClient.get<ApiResponse<any[]>>('/batches/active'),
  },

  // Equipment Management
  equipment: {
    getAll: () => apiClient.get<ApiResponse<any[]>>('/equipment'),
    getById: (id: string) => apiClient.get<ApiResponse<any>>(`/equipment/${id}`),
    getAllStatus: () => apiClient.get<ApiResponse<any[]>>('/equipment/status'),
    getStatus: (id: string) => apiClient.get<ApiResponse<any>>(`/equipment/${id}/status`),
    updateStatus: (id: string, status: string, data?: any) => 
      apiClient.patch<ApiResponse<any>>(`/equipment/${id}/status`, { status, ...data }),
    getMetrics: (id: string, timeRange?: string) => 
      apiClient.get<ApiResponse<any>>(`/equipment/${id}/metrics`, { 
        params: timeRange ? { timeRange } : undefined 
      }),
    getMaintenanceSchedule: (id: string) => 
      apiClient.get<ApiResponse<any[]>>(`/equipment/${id}/maintenance`),
  },

  // Quality Control
  quality: {
    getMetrics: (batchId: string) => 
      apiClient.get<ApiResponse<any>>(`/quality/metrics/${batchId}`),
    updateMetrics: (batchId: string, metrics: any) => 
      apiClient.post<ApiResponse<any>>(`/quality/metrics/${batchId}`, metrics),
    getTests: (batchId: string) => 
      apiClient.get<ApiResponse<any[]>>(`/quality/tests/${batchId}`),
    createTest: (batchId: string, testData: any) => 
      apiClient.post<ApiResponse<any>>(`/quality/tests/${batchId}`, testData),
    updateTest: (testId: string, testData: any) => 
      apiClient.put<ApiResponse<any>>(`/quality/tests/${testId}`, testData),
  },

  // Scheduling
  scheduling: {
    getSchedule: (startDate?: string, endDate?: string) => 
      apiClient.get<ApiResponse<any[]>>('/schedule', { 
        params: { startDate, endDate } 
      }),
    getEquipmentSchedule: (equipmentId: string, startDate?: string, endDate?: string) => 
      apiClient.get<ApiResponse<any[]>>(`/schedule/equipment/${equipmentId}`, { 
        params: { startDate, endDate } 
      }),
    createScheduleEntry: (data: any) => 
      apiClient.post<ApiResponse<any>>('/schedule', data),
    updateScheduleEntry: (id: string, data: any) => 
      apiClient.put<ApiResponse<any>>(`/schedule/${id}`, data),
    deleteScheduleEntry: (id: string) => 
      apiClient.delete<ApiResponse<void>>(`/schedule/${id}`),
  },

  // Customers
  customers: {
    getAll: () => apiClient.get<ApiResponse<any[]>>('/customers'),
    getById: (id: string) => apiClient.get<ApiResponse<any>>(`/customers/${id}`),
    create: (data: any) => apiClient.post<ApiResponse<any>>('/customers', data),
    update: (id: string, data: any) => apiClient.put<ApiResponse<any>>(`/customers/${id}`, data),
    getOrders: (id: string) => apiClient.get<ApiResponse<any[]>>(`/customers/${id}/orders`),
  },

  // Reports and Analytics
  reports: {
    getProductionReport: (reportId: string) => 
      apiClient.get<ApiResponse<any>>(`/reports/production/${reportId}`),
    generateProductionReport: (params: any) => 
      apiClient.post<ApiResponse<any>>('/reports/production', params),
    getPerformanceMetrics: (startDate: string, endDate: string) => 
      apiClient.get<ApiResponse<any>>('/reports/performance', { 
        params: { startDate, endDate } 
      }),
    getEfficiencyReport: (equipmentId?: string, dateRange?: string) => 
      apiClient.get<ApiResponse<any>>('/reports/efficiency', { 
        params: { equipmentId, dateRange } 
      }),
  },

  // User Management
  users: {
    getCurrentUser: () => apiClient.get<ApiResponse<any>>('/users/me'),
    updateProfile: (data: any) => apiClient.put<ApiResponse<any>>('/users/me', data),
    getPermissions: () => apiClient.get<ApiResponse<any>>('/users/me/permissions'),
    changePassword: (oldPassword: string, newPassword: string) => 
      apiClient.post<ApiResponse<void>>('/users/me/change-password', { 
        oldPassword, 
        newPassword 
      }),
  },

  // Real-time data endpoints
  realtime: {
    getLiveMetrics: () => apiClient.get<ApiResponse<any>>('/realtime/metrics'),
    getEquipmentData: (equipmentId: string) => 
      apiClient.get<ApiResponse<any>>(`/realtime/equipment/${equipmentId}`),
    getBatchData: (batchId: string) => 
      apiClient.get<ApiResponse<any>>(`/realtime/batch/${batchId}`),
  },

  // MQTT Broker Configuration
  mqttBrokers: {
    getAll: () => apiClient.get<ApiResponse<any[]>>('/unsBrokerConfigurations'),
    getById: (id: string) => apiClient.get<ApiResponse<any>>(`/unsBrokerConfigurations/${id}`),
    create: (data: any) => apiClient.post<ApiResponse<any>>('/unsBrokerConfigurations', data),
    update: (id: string, data: any) => 
      apiClient.put<ApiResponse<any>>(`/unsBrokerConfigurations/${id}`, data),
    delete: (id: string) => apiClient.delete<ApiResponse<void>>(`/unsBrokerConfigurations/${id}`),
    getConnectionStatus: () => apiClient.get<ApiResponse<any>>('/mqtt/status'),
    testConnection: (id: string) => 
      apiClient.post<ApiResponse<any>>(`/unsBrokerConfigurations/${id}/test-connection`),
    
    // Certificate rotation endpoints
    getCertificateHealth: () => apiClient.get<ApiResponse<any>>('/certificate-rotation/health'),
    getCertificateStatuses: () => apiClient.get<ApiResponse<any[]>>('/certificate-rotation/status'),
    getBrokerCertificateStatus: (brokerId: string) => 
      apiClient.get<ApiResponse<any[]>>(`/certificate-rotation/status/${brokerId}`),
    triggerCertificateCheck: () => 
      apiClient.post<ApiResponse<any[]>>('/certificate-rotation/check'),
    forceRotateCertificate: (brokerId: string, certificateType: 'client' | 'ca') => 
      apiClient.post<ApiResponse<any>>(`/certificate-rotation/rotate/${brokerId}/${certificateType}`),
    getRotationConfig: () => apiClient.get<ApiResponse<any>>('/certificate-rotation/config'),
    updateRotationConfig: (config: any) => 
      apiClient.post<ApiResponse<any>>('/certificate-rotation/config', config),
  },
}

// Utility functions for common operations
export const apiUtils = {
  // Handle API errors consistently
  handleError: (error: any): ApiError => {
    if (error.response?.data) {
      return {
        message: error.response.data.error || error.response.data.message || 'API request failed',
        code: error.response.data.code,
        details: error.response.data.details,
        timestamp: new Date().toISOString(),
      }
    }
    
    return {
      message: error.message || 'Network error occurred',
      code: error.code,
      timestamp: new Date().toISOString(),
    }
  },

  // Upload file with progress tracking
  uploadFile: async (
    endpoint: string, 
    file: File, 
    onProgress?: (progress: number) => void
  ) => {
    const formData = new FormData()
    formData.append('file', file)

    return apiClient.post(endpoint, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(progress)
        }
      },
    })
  },

  // Download file
  downloadFile: async (endpoint: string, filename?: string) => {
    const response = await apiClient.get(endpoint, {
      responseType: 'blob',
    })

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename || 'download')
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },
}

// Export types
export type { ApiResponse, ApiError }

// Production and Quality
export const PRODUCTION_ENDPOINTS = {
  BATCHES: '/api/production/batches',
  QUALITY_CHECKS: '/api/production/quality-checks',
  EQUIPMENT_STATUS: '/api/production/equipment/status',
  PRODUCTION_ORDERS: '/api/production/orders',
  SCHEDULE: '/api/production/schedule',
}

// Recipe Management
export const RECIPE_ENDPOINTS = {
  RECIPES: '/api/recipes',
  PARAMETERS: '/api/recipes/parameters',
  TEMPLATES: '/api/recipes/templates',
  VALIDATION: '/api/recipes/validate',
}