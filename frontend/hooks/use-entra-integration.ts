'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { ManufacturingRole, isAzureActuallyConfigured } from '@/lib/auth-config'

export interface EntraIntegrationData {
  isConnected: boolean
  tenantId: string | null
  clientId: string | null
  totalUsers: number
  activeUsers: number
  adminUsers: number
  usersByRole: Record<string, number>
  connectionStatus: 'connected' | 'disconnected' | 'error' | 'checking'
  lastSync: string | null
  loading: boolean
  error: string | null
}

export interface RoleDisplayInfo {
  role: ManufacturingRole
  displayName: string
  category: string
  userCount: number
}

export function useEntraIntegration() {
  const { isAuthenticated } = useAuth()
  const [data, setData] = useState<EntraIntegrationData>({
    isConnected: false,
    tenantId: null,
    clientId: null,
    totalUsers: 0,
    activeUsers: 0,
    adminUsers: 0,
    usersByRole: {},
    connectionStatus: 'checking',
    lastSync: null,
    loading: true,
    error: null
  })

  useEffect(() => {
    const fetchEntraData = async () => {
      try {
        setData(prev => ({ ...prev, loading: true, error: null }))

        // Check Azure configuration
        const isConfigured = isAzureActuallyConfigured()
        const tenantId = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID
        const clientId = process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID

        if (!isConfigured) {
          setData(prev => ({
            ...prev,
            isConnected: false,
            connectionStatus: 'disconnected',
            loading: false,
            error: 'Azure AD not configured'
          }))
          return
        }

        // Mock data for demonstration (in production, this would call Microsoft Graph API)
        // Note: Direct Graph API calls require admin permissions and would typically be done server-side
        const mockUserData = {
          totalUsers: 28,
          activeUsers: 24,
          adminUsers: 4,
          usersByRole: {
            [ManufacturingRole.ET_ADMIN]: 2,
            [ManufacturingRole.ET_CONTROLS]: 3,
            [ManufacturingRole.ET_DEVELOPER]: 2,
            [ManufacturingRole.OPS_DISTILLERY_LEADERSHIP]: 2,
            [ManufacturingRole.OPS_DISTILLERY_SUPERVISOR]: 4,
            [ManufacturingRole.OPS_DISTILLERY_SHIFTLEAD]: 6,
            [ManufacturingRole.OPS_DISTILLERY_OPERATOR]: 8,
            [ManufacturingRole.MAINTENANCE_LEADERSHIP]: 1,
            [ManufacturingRole.MAINTENANCE_TECHNICIAN]: 3
          }
        }

        setData({
          isConnected: true,
          tenantId,
          clientId,
          totalUsers: mockUserData.totalUsers,
          activeUsers: mockUserData.activeUsers,
          adminUsers: mockUserData.adminUsers,
          usersByRole: mockUserData.usersByRole,
          connectionStatus: 'connected',
          lastSync: new Date().toISOString(),
          loading: false,
          error: null
        })

      } catch (error) {
        console.error('Failed to fetch Entra integration data:', error)
        setData(prev => ({
          ...prev,
          loading: false,
          connectionStatus: 'error',
          error: error instanceof Error ? error.message : 'Failed to fetch Entra data'
        }))
      }
    }

    fetchEntraData()
  }, [isAuthenticated])

  return data
}

export function getRoleDisplayInfo(usersByRole: Record<string, number>): RoleDisplayInfo[] {
  const roleCategories = {
    'Engineering & Technology': [
      ManufacturingRole.ET_ADMIN,
      ManufacturingRole.ET_CONTROLS,
      ManufacturingRole.ET_DEVELOPER
    ],
    'Operations': [
      ManufacturingRole.OPS_DISTILLERY_LEADERSHIP,
      ManufacturingRole.OPS_DISTILLERY_SUPERVISOR,
      ManufacturingRole.OPS_DISTILLERY_SHIFTLEAD,
      ManufacturingRole.OPS_DISTILLERY_OPERATOR
    ],
    'Maintenance': [
      ManufacturingRole.MAINTENANCE_LEADERSHIP,
      ManufacturingRole.MAINTENANCE_TECHNICIAN
    ]
  }

  const roleDisplayNames = {
    [ManufacturingRole.ET_ADMIN]: 'E&T Admin',
    [ManufacturingRole.ET_CONTROLS]: 'E&T Controls',
    [ManufacturingRole.ET_DEVELOPER]: 'E&T Developer',
    [ManufacturingRole.OPS_DISTILLERY_LEADERSHIP]: 'Operations Leadership',
    [ManufacturingRole.OPS_DISTILLERY_SUPERVISOR]: 'Operations Supervisor',
    [ManufacturingRole.OPS_DISTILLERY_SHIFTLEAD]: 'Operations Shift Lead',
    [ManufacturingRole.OPS_DISTILLERY_OPERATOR]: 'Operations Operator',
    [ManufacturingRole.MAINTENANCE_LEADERSHIP]: 'Maintenance Leadership',
    [ManufacturingRole.MAINTENANCE_TECHNICIAN]: 'Maintenance Technician'
  }

  const result: RoleDisplayInfo[] = []

  Object.entries(roleCategories).forEach(([category, roles]) => {
    roles.forEach(role => {
      result.push({
        role,
        displayName: roleDisplayNames[role],
        category,
        userCount: usersByRole[role] || 0
      })
    })
  })

  return result.sort((a, b) => {
    // Sort by category first, then by user count descending
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category)
    }
    return b.userCount - a.userCount
  })
} 