import { useState, useEffect, useCallback, useRef } from 'react'

export interface HealthCheckResult {
  status: 'up' | 'down'
  details?: {
    responseTime?: string
    connection?: string
    error?: string
    code?: string
    version?: string
    environment?: string
  }
  timestamp: string
}

export interface SystemHealth {
  status: 'ok' | 'error'
  database: HealthCheckResult
  api: HealthCheckResult
  uptime: number
  memory: {
    used: number
    total: number
  }
  source?: 'backend' | 'nextjs' | 'mixed'
}

export interface UseHealthMonitoringOptions {
  autoRefresh?: boolean
  refreshInterval?: number
  onHealthChange?: (health: SystemHealth) => void
  onError?: (error: string) => void
  maxRetries?: number
  backoffMultiplier?: number
  maxBackoffDelay?: number
}

export function useHealthMonitoring(options: UseHealthMonitoringOptions = {}) {
  const {
    autoRefresh = true,
    refreshInterval = 30000, // Increased to 30 seconds to reduce load
    onHealthChange,
    onError,
    maxRetries = 3,
    backoffMultiplier = 2,
    maxBackoffDelay = 60000 // Max 1 minute
  } = options

  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  
  // Circuit breaker state
  const [isCircuitOpen, setIsCircuitOpen] = useState(false)
  const [failureCount, setFailureCount] = useState(0)
  const [nextRetryTime, setNextRetryTime] = useState<number>(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const calculateBackoffDelay = useCallback((attempt: number) => {
    const delay = Math.min(
      refreshInterval * Math.pow(backoffMultiplier, attempt),
      maxBackoffDelay
    )
    return delay
  }, [refreshInterval, backoffMultiplier, maxBackoffDelay])

  const resetCircuitBreaker = useCallback(() => {
    setIsCircuitOpen(false)
    setFailureCount(0)
    setNextRetryTime(0)
  }, [])

  const openCircuitBreaker = useCallback((attempt: number) => {
    setIsCircuitOpen(true)
    const delay = calculateBackoffDelay(attempt)
    const nextRetry = Date.now() + delay
    setNextRetryTime(nextRetry)
    
    console.log(`Health monitoring circuit breaker opened. Next retry in ${delay}ms`)
    
    // Auto-close circuit breaker after delay
    setTimeout(() => {
      setIsCircuitOpen(false)
      setNextRetryTime(0)
    }, delay)
  }, [calculateBackoffDelay])

  const fetchHealth = useCallback(async (endpoint: string = '/api/_health'): Promise<SystemHealth | null> => {
    // Check circuit breaker
    if (isCircuitOpen && Date.now() < nextRetryTime) {
      return null
    }

    try {
      // Use the backend API URL from environment variables
      const baseUrl = process.env['NEXT_PUBLIC_MES_API_URL'] || 'http://localhost:3000/api'
      const fullUrl = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint.replace('/api', '')}`
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
      
      const response = await fetch(fullUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json()
      
      // Reset circuit breaker on success
      resetCircuitBreaker()
      
      return data as SystemHealth
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Handle specific error types
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.warn('Health check request timed out')
        } else if (error.message.includes('Failed to fetch') || error.message.includes('ERR_INSUFFICIENT_RESOURCES')) {
          console.warn('Backend service appears to be unavailable')
        }
      }
      
      setLastError(errorMessage)
      onError?.(errorMessage)
      
      // Increment failure count and potentially open circuit breaker
      const newFailureCount = failureCount + 1
      setFailureCount(newFailureCount)
      
      if (newFailureCount >= maxRetries) {
        openCircuitBreaker(newFailureCount - maxRetries)
      }
      
      return null
    }
  }, [onError, isCircuitOpen, nextRetryTime, failureCount, maxRetries, resetCircuitBreaker, openCircuitBreaker])

  const fetchSpecificHealth = useCallback(async (type: 'db' | 'api' | 'live' | 'ready'): Promise<HealthCheckResult | boolean | null> => {
    // Check circuit breaker
    if (isCircuitOpen && Date.now() < nextRetryTime) {
      return null
    }

    try {
      // Use the backend API URL from environment variables
      const baseUrl = process.env['NEXT_PUBLIC_MES_API_URL'] || 'http://localhost:3000/api'
      const fullUrl = `${baseUrl}/_health/${type}`
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
      
      const response = await fetch(fullUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      })
      
      clearTimeout(timeoutId)
      
      // Handle liveness and readiness checks (no content)
      if (type === 'live' || type === 'ready') {
        return response.ok
      }
      
      if (!response.ok) {
        throw new Error(`${type} health check failed: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json()
      return data as HealthCheckResult
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setLastError(errorMessage)
      onError?.(errorMessage)
      return null
    }
  }, [onError, isCircuitOpen, nextRetryTime])

  const refreshHealth = useCallback(async () => {
    // Don't refresh if circuit breaker is open
    if (isCircuitOpen && Date.now() < nextRetryTime) {
      return
    }

    setLoading(true)
    setLastError(null)
    
    try {
      const health = await fetchHealth()
      if (health) {
        setSystemHealth(health)
        setLastUpdated(new Date())
        onHealthChange?.(health)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch health data'
      setLastError(errorMessage)
      onError?.(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [fetchHealth, onHealthChange, onError, isCircuitOpen, nextRetryTime])

  // Auto-refresh effect with circuit breaker awareness
  useEffect(() => {
    if (!autoRefresh) return

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    // Initial fetch (unless circuit breaker is open)
    if (!isCircuitOpen || Date.now() >= nextRetryTime) {
      refreshHealth()
    }

    // Set up interval with dynamic delay based on circuit breaker state
    const scheduleNext = () => {
      const delay = isCircuitOpen && Date.now() < nextRetryTime 
        ? Math.max(nextRetryTime - Date.now(), 1000)
        : refreshInterval

      intervalRef.current = setTimeout(() => {
        refreshHealth()
        scheduleNext()
      }, delay)
    }

    scheduleNext()

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [autoRefresh, refreshInterval, refreshHealth, isCircuitOpen, nextRetryTime])

  // Calculate health metrics
  const healthMetrics = systemHealth ? {
    isHealthy: systemHealth.status === 'ok',
    isDatabaseHealthy: systemHealth.database.status === 'up',
    isApiHealthy: systemHealth.api.status === 'up',
    memoryUsagePercent: Math.round((systemHealth.memory.used / systemHealth.memory.total) * 100),
    uptimeHours: Math.round(systemHealth.uptime / 3600 * 100) / 100,
    databaseResponseTime: systemHealth.database.details?.responseTime,
    apiVersion: systemHealth.api.details?.version,
    environment: systemHealth.api.details?.environment
  } : null

  return {
    systemHealth,
    healthMetrics,
    loading,
    lastError,
    lastUpdated,
    refreshHealth,
    fetchHealth,
    fetchSpecificHealth,
    // Circuit breaker status
    isCircuitOpen,
    failureCount,
    nextRetryTime: nextRetryTime > 0 ? new Date(nextRetryTime) : null,
    resetCircuitBreaker
  }
} 