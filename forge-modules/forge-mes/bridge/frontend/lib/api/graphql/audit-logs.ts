import { gql } from '@apollo/client'
import { useState, useCallback } from 'react'
import { UnifiedGraphQLClient } from '../unified-graphql-client'

// GraphQL queries for audit logs
export const GET_AUDIT_LOGS = gql`
  query GetAuditLogs(
    $limit: Int
    $page: Int
    $sortBy: String
    $sortOrder: String
    $filters: AuditLogFilterInput
  ) {
    auditLogs(
      limit: $limit
      page: $page
      sortBy: $sortBy
      sortOrder: $sortOrder
      filters: $filters
    ) {
      data {
        id
        globalId
        entityType
        entityId
        action
        oldValues
        newValues
        user {
          id
          username
          firstName
          lastName
        }
        ipAddress
        userAgent
        createdAt
        updatedAt
      }
      page
      limit
      total
      totalPages
      hasNextPage
      hasPreviousPage
    }
  }
`

export const GET_AUDIT_LOG = gql`
  query GetAuditLog($id: ID!) {
    auditLog(id: $id) {
      id
      globalId
      entityType
      entityId
      action
      oldValues
      newValues
      user {
        id
        username
        firstName
        lastName
      }
      ipAddress
      userAgent
      createdAt
      updatedAt
    }
  }
`

export const GET_ENTITY_AUDIT_HISTORY = gql`
  query GetEntityAuditHistory(
    $entityType: String!
    $entityId: String!
    $limit: Int
    $page: Int
  ) {
    entityAuditHistory(
      entityType: $entityType
      entityId: $entityId
      limit: $limit
      page: $page
    ) {
      data {
        id
        globalId
        entityType
        entityId
        action
        oldValues
        newValues
        user {
          id
          username
          firstName
          lastName
        }
        ipAddress
        userAgent
        createdAt
        updatedAt
      }
      page
      limit
      total
      totalPages
      hasNextPage
      hasPreviousPage
    }
  }
`

export const GET_USER_AUDIT_HISTORY = gql`
  query GetUserAuditHistory(
    $userId: String!
    $action: AuditAction
    $entityType: String
    $startDate: String
    $endDate: String
    $limit: Int
    $page: Int
  ) {
    userAuditHistory(
      userId: $userId
      action: $action
      entityType: $entityType
      startDate: $startDate
      endDate: $endDate
      limit: $limit
      page: $page
    ) {
      data {
        id
        globalId
        entityType
        entityId
        action
        oldValues
        newValues
        user {
          id
          username
          firstName
          lastName
        }
        ipAddress
        userAgent
        createdAt
        updatedAt
      }
      page
      limit
      total
      totalPages
      hasNextPage
      hasPreviousPage
    }
  }
`

// Types for audit logs
export interface AuditLogUser {
  id: string
  username: string
  firstName?: string | null
  lastName?: string | null
}

export interface AuditLogEntry {
  id: string
  globalId: string
  entityType: string
  entityId: string
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
  user: AuditLogUser
  ipAddress?: string | null
  userAgent?: string | null
  createdAt: string
  updatedAt: string
}

export interface PaginatedAuditResponse {
  data: AuditLogEntry[]
  page: number
  limit: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export interface AuditFilters {
  entityType?: string
  entityId?: string
  action?: string
  userId?: string
  startDate?: string
  endDate?: string
}

// Custom hook for audit logs
export function useAuditLogs() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const client = new UnifiedGraphQLClient()

  const fetchAuditLogs = useCallback(async (
    page: number = 1,
    limit: number = 20,
    sortBy: string = 'createdAt',
    sortOrder: string = 'desc',
    filters?: AuditFilters
  ): Promise<PaginatedAuditResponse | null> => {
    try {
      setLoading(true)
      setError(null)

      const variables = {
        page,
        limit,
        sortBy,
        sortOrder,
        filters: filters || {}
      }

      const result = await client.query<{ auditLogs: PaginatedAuditResponse }>(
        GET_AUDIT_LOGS,
        { variables }
      )

      return result.auditLogs
    } catch (err) {
      console.error('Failed to fetch audit logs:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch audit logs')
      return null
    } finally {
      setLoading(false)
    }
  }, [client])

  const fetchAuditLog = useCallback(async (id: string): Promise<AuditLogEntry | null> => {
    try {
      setLoading(true)
      setError(null)

      const result = await client.query<{ auditLog: AuditLogEntry }>(
        GET_AUDIT_LOG,
        { variables: { id } }
      )

      return result.auditLog
    } catch (err) {
      console.error('Failed to fetch audit log:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch audit log')
      return null
    } finally {
      setLoading(false)
    }
  }, [client])

  const fetchEntityAuditHistory = useCallback(async (
    entityType: string,
    entityId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<PaginatedAuditResponse | null> => {
    try {
      setLoading(true)
      setError(null)

      const result = await client.query<{ entityAuditHistory: PaginatedAuditResponse }>(
        GET_ENTITY_AUDIT_HISTORY,
        { variables: { entityType, entityId, page, limit } }
      )

      return result.entityAuditHistory
    } catch (err) {
      console.error('Failed to fetch entity audit history:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch entity audit history')
      return null
    } finally {
      setLoading(false)
    }
  }, [client])

  const fetchUserAuditHistory = useCallback(async (
    userId: string,
    options?: {
      action?: string
      entityType?: string
      startDate?: string
      endDate?: string
      page?: number
      limit?: number
    }
  ): Promise<PaginatedAuditResponse | null> => {
    try {
      setLoading(true)
      setError(null)

      const variables = {
        userId,
        action: options?.action,
        entityType: options?.entityType,
        startDate: options?.startDate,
        endDate: options?.endDate,
        page: options?.page || 1,
        limit: options?.limit || 20
      }

      const result = await client.query<{ userAuditHistory: PaginatedAuditResponse }>(
        GET_USER_AUDIT_HISTORY,
        { variables }
      )

      return result.userAuditHistory
    } catch (err) {
      console.error('Failed to fetch user audit history:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch user audit history')
      return null
    } finally {
      setLoading(false)
    }
  }, [client])

  return {
    loading,
    error,
    fetchAuditLogs,
    fetchAuditLog,
    fetchEntityAuditHistory,
    fetchUserAuditHistory
  }
} 