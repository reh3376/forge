'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { getMsalInstance } from '@/lib/auth-context'
import { ManufacturingRole } from '@/lib/auth-config'
import { AccountInfo } from '@azure/msal-browser'

export default function RoleTestPage() {
  const { login, logout, user, isAuthenticated, isLoading, error } = useAuth()
  const [tokenDebugInfo, setTokenDebugInfo] = useState<{
    account: AccountInfo | null
    allClaims: Record<string, unknown>
    extractedRoles: string[]
    validRoles: ManufacturingRole[]
    rawTokenClaims: string
  } | null>(null)

  useEffect(() => {
    const updateTokenInfo = () => {
      const instance = getMsalInstance()
      const activeAccount = instance.getActiveAccount()
      
      if (activeAccount && activeAccount.idTokenClaims) {
        const claims = activeAccount.idTokenClaims
        
        // Extract all possible role sources
        let extractedRoles: string[] = []
        
        // Standard roles claim
        if (claims.roles && Array.isArray(claims.roles)) {
          extractedRoles = [...extractedRoles, ...claims.roles]
        }
        
        // App roles claim
        if (claims['app_roles'] && Array.isArray(claims['app_roles'])) {
          extractedRoles = [...extractedRoles, ...(claims['app_roles'] as string[])]
        }
        
        // Extension roles
        if (claims['extension_roles'] && Array.isArray(claims['extension_roles'])) {
          extractedRoles = [...extractedRoles, ...(claims['extension_roles'] as string[])]
        }
        
        // Groups claim
        if (claims['groups'] && Array.isArray(claims['groups'])) {
          extractedRoles = [...extractedRoles, ...(claims['groups'] as string[])]
        }
        
        // Any other role-related claims
        Object.keys(claims).forEach(key => {
          if (key.toLowerCase().includes('role') && Array.isArray(claims[key])) {
            extractedRoles = [...extractedRoles, ...(claims[key] as string[])]
          }
        })
        
        // Remove duplicates
        extractedRoles = [...new Set(extractedRoles)]
        
        // Filter valid manufacturing roles
        const validRoles = extractedRoles.filter((role): role is ManufacturingRole => 
          Object.values(ManufacturingRole).includes(role as ManufacturingRole)
        )
        
        setTokenDebugInfo({
          account: activeAccount,
          allClaims: claims,
          extractedRoles,
          validRoles,
          rawTokenClaims: JSON.stringify(claims, null, 2)
        })
      } else {
        setTokenDebugInfo(null)
      }
    }

    updateTokenInfo()
    
    // Update when authentication state changes
    const interval = setInterval(updateTokenInfo, 1000)
    return () => clearInterval(interval)
  }, [isAuthenticated, user])

  const handleLogin = async () => {
    try {
      await login()
    } catch (error) {
      console.error('Login failed:', error)
    }
  }

  const handleLogout = async () => {
    try {
      await logout()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <h1 className="text-3xl font-bold">Azure Role Extraction Test</h1>
      </div>

      {/* Authentication Status */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between">
              <span>Authenticated</span>
              <Badge variant={isAuthenticated ? 'default' : 'secondary'}>
                {isAuthenticated ? 'Yes' : 'No'}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <span>Loading</span>
              <Badge variant={isLoading ? 'default' : 'secondary'}>
                {isLoading ? 'Yes' : 'No'}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <span>Has Error</span>
              <Badge variant={error ? 'destructive' : 'secondary'}>
                {error ? 'Yes' : 'No'}
              </Badge>
            </div>
          </div>
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
          
          <div className="flex gap-2">
            {!isAuthenticated ? (
              <Button onClick={handleLogin} disabled={isLoading}>
                {isLoading ? 'Logging in...' : 'Login with Azure'}
              </Button>
            ) : (
              <Button onClick={handleLogout} variant="outline">
                Logout
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* User Information */}
      {user && (
        <Card>
          <CardHeader>
            <CardTitle>User Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <strong>Name:</strong> {user.name}
              </div>
              <div>
                <strong>Email:</strong> {user.email}
              </div>
              <div>
                <strong>ID:</strong> {user.id}
              </div>
              <div>
                <strong>Department:</strong> {user.department || 'Not set'}
              </div>
            </div>
            
            <div>
              <strong>Roles ({user.roles.length}):</strong>
              <div className="flex flex-wrap gap-2 mt-2">
                {user.roles.length > 0 ? (
                  user.roles.map(role => (
                    <Badge key={role} variant="default">{role}</Badge>
                  ))
                ) : (
                  <Badge variant="secondary">No roles assigned</Badge>
                )}
              </div>
            </div>
            
            <div>
              <strong>Permissions ({user.permissions.length}):</strong>
              <div className="flex flex-wrap gap-2 mt-2">
                {user.permissions.length > 0 ? (
                  user.permissions.slice(0, 10).map(permission => (
                    <Badge key={permission} variant="outline">{permission}</Badge>
                  ))
                ) : (
                  <Badge variant="secondary">No permissions</Badge>
                )}
                {user.permissions.length > 10 && (
                  <Badge variant="secondary">+{user.permissions.length - 10} more</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Token Debug Information */}
      {tokenDebugInfo && (
        <Card>
          <CardHeader>
            <CardTitle>Token Debug Information</CardTitle>
            <CardDescription>
              Raw token claims and role extraction details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <strong>Account Username:</strong> {tokenDebugInfo.account?.username}
            </div>
            
            <div>
              <strong>All Extracted Roles ({tokenDebugInfo.extractedRoles.length}):</strong>
              <div className="bg-gray-50 p-3 rounded text-sm mt-2">
                <pre>{JSON.stringify(tokenDebugInfo.extractedRoles, null, 2)}</pre>
              </div>
            </div>
            
            <div>
              <strong>Valid Manufacturing Roles ({tokenDebugInfo.validRoles.length}):</strong>
              <div className="bg-green-50 p-3 rounded text-sm mt-2">
                <pre>{JSON.stringify(tokenDebugInfo.validRoles, null, 2)}</pre>
              </div>
            </div>
            
            <div>
              <strong>Expected Manufacturing Roles:</strong>
              <div className="bg-blue-50 p-3 rounded text-sm mt-2">
                <pre>{JSON.stringify(Object.values(ManufacturingRole), null, 2)}</pre>
              </div>
            </div>
            
            <div>
              <strong>All Token Claims:</strong>
              <div className="bg-gray-50 p-3 rounded text-sm mt-2 max-h-96 overflow-y-auto">
                <pre>{tokenDebugInfo.rawTokenClaims}</pre>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expected vs Actual Roles */}
      <Card>
        <CardHeader>
          <CardTitle>Role Mapping Guide</CardTitle>
          <CardDescription>
            These are the roles that should be configured in your Azure AD app registration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <h4 className="font-semibold">Engineering & Technology:</h4>
            <ul className="list-disc list-inside text-sm space-y-1 ml-4">
              <li><code>{ManufacturingRole.ET_ADMIN}</code> - E&T Admin</li>
              <li><code>{ManufacturingRole.ET_CONTROLS}</code> - E&T Controls</li>
              <li><code>{ManufacturingRole.ET_DEVELOPER}</code> - E&T Developer</li>
            </ul>
            
            <h4 className="font-semibold mt-4">Operations:</h4>
            <ul className="list-disc list-inside text-sm space-y-1 ml-4">
              <li><code>{ManufacturingRole.OPS_DISTILLERY_LEADERSHIP}</code> - Operations Leadership</li>
              <li><code>{ManufacturingRole.OPS_DISTILLERY_SUPERVISOR}</code> - Operations Supervisor</li>
              <li><code>{ManufacturingRole.OPS_DISTILLERY_SHIFTLEAD}</code> - Operations Shift Lead</li>
              <li><code>{ManufacturingRole.OPS_DISTILLERY_OPERATOR}</code> - Operations Operator</li>
            </ul>
            
            <h4 className="font-semibold mt-4">Maintenance:</h4>
            <ul className="list-disc list-inside text-sm space-y-1 ml-4">
              <li><code>{ManufacturingRole.MAINTENANCE_LEADERSHIP}</code> - Maintenance Leadership</li>
              <li><code>{ManufacturingRole.MAINTENANCE_TECHNICIAN}</code> - Maintenance Technician</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 