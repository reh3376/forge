'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { getMsalInstance } from '@/lib/auth-context'
import { ManufacturingRole, getMsalConfig, isAzureActuallyConfigured } from '@/lib/auth-config'
import { AccountInfo } from '@azure/msal-browser'

export default function AuthStatusPage() {
  const { login, logout, user, isAuthenticated, isLoading, error, devMode } = useAuth()
  const [debugInfo, setDebugInfo] = useState<{
    msalInstance: {
      configuration: Record<string, unknown>
      logger: unknown
    }
    msalConfig: Record<string, unknown>
    accounts: AccountInfo[]
    activeAccount: AccountInfo | null
    environmentVars: Record<string, string>
    azureConfigured: boolean
    tokenClaims: Record<string, unknown> | null
    sessionStorage: Record<string, string>
    localStorage: Record<string, string>
  } | null>(null)

  useEffect(() => {
    const updateDebugInfo = () => {
      try {
        const instance = getMsalInstance()
        const config = getMsalConfig()
        const accounts = instance.getAllAccounts()
        const activeAccount = instance.getActiveAccount()
        
        // Get environment variables (only NEXT_PUBLIC ones are available on client)
        const environmentVars: Record<string, string> = {}
        if (typeof window !== 'undefined') {
          Object.keys(process.env).forEach(key => {
            if (key.startsWith('NEXT_PUBLIC_')) {
              environmentVars[key] = process.env[key] || ''
            }
          })
        }
        
        // Get token claims if available
        let tokenClaims = null
        if (activeAccount && activeAccount.idTokenClaims) {
          tokenClaims = activeAccount.idTokenClaims
        }
        
        // Get storage info
        const sessionStorage: Record<string, string> = {}
        const localStorage: Record<string, string> = {}
        
        if (typeof window !== 'undefined') {
          try {
            // Get MSAL-related items from session storage
            for (let i = 0; i < window.sessionStorage.length; i++) {
              const key = window.sessionStorage.key(i)
              if (key && key.includes('msal')) {
                const value = window.sessionStorage.getItem(key)
                if (value) sessionStorage[key] = value
              }
            }
            
            // Get MSAL-related items from local storage
            for (let i = 0; i < window.localStorage.length; i++) {
              const key = window.localStorage.key(i)
              if (key && key.includes('msal')) {
                const value = window.localStorage.getItem(key)
                if (value) localStorage[key] = value
              }
            }
          } catch (e) {
            console.error('Error reading storage:', e)
          }
        }
        
        setDebugInfo({
          msalInstance: {
            configuration: instance.getConfiguration(),
            logger: instance.getLogger()
          },
          msalConfig: config,
          accounts,
          activeAccount,
          environmentVars,
          azureConfigured: isAzureActuallyConfigured(),
          tokenClaims,
          sessionStorage,
          localStorage
        })
      } catch (error) {
        console.error('Error updating debug info:', error)
      }
    }

    updateDebugInfo()
    
    // Update periodically
    const interval = setInterval(updateDebugInfo, 2000)
    return () => clearInterval(interval)
  }, [isAuthenticated, user])

  const handleLogin = async () => {
    try {
      console.log('🔐 Starting login process...')
      await login()
    } catch (error) {
      console.error('Login failed:', error)
    }
  }

  const handleLogout = async () => {
    try {
      console.log('🚪 Starting logout process...')
      await logout()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  const handleClearCache = async () => {
    try {
      const instance = getMsalInstance()
      await instance.clearCache()
      console.log('Cache cleared')
      window.location.reload()
    } catch (error) {
      console.error('Failed to clear cache:', error)
    }
  }

  const handleTestSilentToken = async () => {
    try {
      const instance = getMsalInstance()
      const accounts = instance.getAllAccounts()
      if (accounts.length > 0 && accounts[0]) {
        const result = await instance.acquireTokenSilent({
          scopes: ['User.Read'],
          account: accounts[0]
        })
        console.log('Silent token acquisition successful:', result)
      } else {
        console.log('No accounts available for silent token acquisition')
      }
    } catch (error) {
      console.error('Silent token acquisition failed:', error)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <h1 className="text-3xl font-bold">Authentication Status & Debug</h1>
      </div>

      {/* Authentication Status */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            
            <div className="flex items-center justify-between">
              <span>Dev Mode</span>
              <Badge variant={devMode.isEnabled ? 'default' : 'secondary'}>
                {devMode.isEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </div>
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
          
          <div className="flex gap-2 flex-wrap">
            {!isAuthenticated ? (
              <Button onClick={handleLogin} disabled={isLoading}>
                {isLoading ? 'Logging in...' : 'Login with Azure'}
              </Button>
            ) : (
              <Button onClick={handleLogout} variant="outline">
                Logout
              </Button>
            )}
            <Button onClick={handleClearCache} variant="outline">
              Clear Cache
            </Button>
            <Button onClick={handleTestSilentToken} variant="outline">
              Test Silent Token
            </Button>
            {devMode.isEnabled && (
              <Button onClick={() => devMode.signInWithDemoUser(ManufacturingRole.OPS_DISTILLERY_SUPERVISOR)} variant="outline">
                Demo Login
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
              <div><strong>Name:</strong> {user.name}</div>
              <div><strong>Email:</strong> {user.email}</div>
              <div><strong>ID:</strong> {user.id}</div>
              <div><strong>Department:</strong> {user.department || 'Not set'}</div>
              <div><strong>Shift:</strong> {user.shift || 'Not set'}</div>
              <div><strong>Last Login:</strong> {user.lastLogin?.toLocaleString() || 'Unknown'}</div>
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
                  user.permissions.slice(0, 15).map(permission => (
                    <Badge key={permission} variant="outline">{permission}</Badge>
                  ))
                ) : (
                  <Badge variant="secondary">No permissions</Badge>
                )}
                {user.permissions.length > 15 && (
                  <Badge variant="secondary">+{user.permissions.length - 15} more</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Environment & Configuration */}
      {debugInfo && (
        <Card>
          <CardHeader>
            <CardTitle>Environment & Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <strong>Azure Configured:</strong> 
              <Badge variant={debugInfo.azureConfigured ? 'default' : 'destructive'} className="ml-2">
                {debugInfo.azureConfigured ? 'Yes' : 'No'}
              </Badge>
            </div>
            
            <div>
              <strong>Environment Variables:</strong>
              <div className="bg-gray-50 p-3 rounded text-sm mt-2 max-h-48 overflow-y-auto">
                <pre>{JSON.stringify(debugInfo.environmentVars, null, 2)}</pre>
              </div>
            </div>
            
            <div>
              <strong>MSAL Configuration:</strong>
              <div className="bg-gray-50 p-3 rounded text-sm mt-2 max-h-48 overflow-y-auto">
                <pre>{JSON.stringify(debugInfo.msalConfig, null, 2)}</pre>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* MSAL Account Information */}
      {debugInfo && (
        <Card>
          <CardHeader>
            <CardTitle>MSAL Account Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <strong>All Accounts ({debugInfo.accounts.length}):</strong>
              <div className="bg-gray-50 p-3 rounded text-sm mt-2 max-h-48 overflow-y-auto">
                <pre>{JSON.stringify(debugInfo.accounts, null, 2)}</pre>
              </div>
            </div>
            
            <div>
              <strong>Active Account:</strong>
              <div className="bg-gray-50 p-3 rounded text-sm mt-2 max-h-48 overflow-y-auto">
                <pre>{JSON.stringify(debugInfo.activeAccount, null, 2)}</pre>
              </div>
            </div>
            
            {debugInfo.tokenClaims && (
              <div>
                <strong>Token Claims:</strong>
                <div className="bg-green-50 p-3 rounded text-sm mt-2 max-h-48 overflow-y-auto">
                  <pre>{JSON.stringify(debugInfo.tokenClaims, null, 2)}</pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Storage Information */}
      {debugInfo && (
        <Card>
          <CardHeader>
            <CardTitle>Browser Storage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <strong>Session Storage (MSAL items):</strong>
              <div className="bg-gray-50 p-3 rounded text-sm mt-2 max-h-48 overflow-y-auto">
                <pre>{JSON.stringify(debugInfo.sessionStorage, null, 2)}</pre>
              </div>
            </div>
            
            <div>
              <strong>Local Storage (MSAL items):</strong>
              <div className="bg-gray-50 p-3 rounded text-sm mt-2 max-h-48 overflow-y-auto">
                <pre>{JSON.stringify(debugInfo.localStorage, null, 2)}</pre>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expected Roles */}
      <Card>
        <CardHeader>
          <CardTitle>Expected Manufacturing Roles</CardTitle>
          <CardDescription>
            These roles should be configured in your Azure AD app registration
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