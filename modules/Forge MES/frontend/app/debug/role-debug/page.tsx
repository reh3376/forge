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
import { AlertCircle, CheckCircle, XCircle, RefreshCw } from 'lucide-react'

interface TokenDebugInfo {
  account: AccountInfo | null
  allClaims: Record<string, unknown>
  extractedRoles: string[]
  validRoles: ManufacturingRole[]
  rawTokenClaims: string
  possibleRoleSources: Array<{
    source: string
    found: boolean
    value: unknown
    type: string
  }>
}

export default function RoleDebugPage() {
  const { login, logout, user, isAuthenticated, isLoading, error } = useAuth()
  const [tokenDebugInfo, setTokenDebugInfo] = useState<TokenDebugInfo | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const updateTokenInfo = async () => {
    setRefreshing(true)
    try {
      const instance = getMsalInstance()
      const activeAccount = instance.getActiveAccount()
      
      if (activeAccount && activeAccount.idTokenClaims) {
        const claims = activeAccount.idTokenClaims
        
        // Check all possible role sources
        const possibleRoleSources = [
          { source: 'roles', found: !!claims.roles, value: claims.roles, type: typeof claims.roles },
          { source: 'app_roles', found: !!claims['app_roles'], value: claims['app_roles'], type: typeof claims['app_roles'] },
          { source: 'extension_roles', found: !!claims['extension_roles'], value: claims['extension_roles'], type: typeof claims['extension_roles'] },
          { source: 'groups', found: !!claims['groups'], value: claims['groups'], type: typeof claims['groups'] },
          { source: 'wids', found: !!claims['wids'], value: claims['wids'], type: typeof claims['wids'] },
          { source: 'hasgroups', found: !!claims['hasgroups'], value: claims['hasgroups'], type: typeof claims['hasgroups'] },
        ]

        // Add any other claims that might contain roles
        Object.keys(claims).forEach(key => {
          if (key.toLowerCase().includes('role') && !possibleRoleSources.find(s => s.source === key)) {
            possibleRoleSources.push({
              source: key,
              found: !!claims[key],
              value: claims[key],
              type: typeof claims[key]
            })
          }
        })
        
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
          rawTokenClaims: JSON.stringify(claims, null, 2),
          possibleRoleSources
        })
      } else {
        setTokenDebugInfo(null)
      }
    } catch (error) {
      console.error('Error updating token info:', error)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    updateTokenInfo()
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

  const handleRefresh = () => {
    updateTokenInfo()
  }

  const handleForceTokenRefresh = async () => {
    try {
      const instance = getMsalInstance()
      const activeAccount = instance.getActiveAccount()
      
      if (activeAccount) {
        // Force a new token request
        const silentRequest = {
          scopes: ['User.Read'],
          account: activeAccount,
          forceRefresh: true
        }
        
        await instance.acquireTokenSilent(silentRequest)
        await updateTokenInfo()
      }
    } catch (error) {
      console.error('Force refresh failed:', error)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <h1 className="text-3xl font-bold">Azure Role Debug Center</h1>
        <Button 
          onClick={handleRefresh} 
          variant="outline" 
          size="sm"
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Authentication Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isAuthenticated ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            Authentication Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <strong>Authenticated:</strong> 
              <Badge variant={isAuthenticated ? 'default' : 'destructive'} className="ml-2">
                {isAuthenticated ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div>
              <strong>Loading:</strong> 
              <Badge variant={isLoading ? 'secondary' : 'outline'} className="ml-2">
                {isLoading ? 'Yes' : 'No'}
              </Badge>
            </div>
          </div>
          
          {user && (
            <div className="space-y-2 border-t pt-4">
              <h4 className="font-semibold">Current User:</h4>
              <div className="text-slate-700 dark:text-slate-300"><strong>Name:</strong> {user.name}</div>
              <div className="text-slate-700 dark:text-slate-300"><strong>Email:</strong> {user.email}</div>
              <div className="text-slate-700 dark:text-slate-300"><strong>User ID:</strong> {user.id}</div>
              <div>
                <strong>Roles ({user.roles.length}):</strong> 
                {user.roles.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {user.roles.map(role => (
                      <Badge key={role} variant="default">{role}</Badge>
                    ))}
                  </div>
                ) : (
                  <Badge variant="destructive" className="ml-2">No roles found</Badge>
                )}
              </div>
              <div className="text-slate-700 dark:text-slate-300"><strong>Permissions:</strong> {user.permissions.length}</div>
            </div>
          )}
          
          {error && (
            <div className="border-t pt-4">
              <h4 className="font-semibold text-red-700 dark:text-red-400">Error:</h4>
              <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">
                {error}
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            {!isAuthenticated ? (
              <Button onClick={handleLogin}>Login with Azure</Button>
            ) : (
              <>
                <Button onClick={handleLogout} variant="outline">Logout</Button>
                <Button onClick={handleForceTokenRefresh} variant="outline">
                  Force Token Refresh
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Role Sources Analysis */}
      {tokenDebugInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Role Sources Analysis
            </CardTitle>
            <CardDescription>
              Checking all possible sources where roles might be stored in the Azure token
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tokenDebugInfo.possibleRoleSources.map((source, index) => (
                <div key={index} className="border rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    {source.found ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <strong className="text-slate-800 dark:text-slate-200">{source.source}</strong>
                    <Badge variant={source.found ? 'default' : 'secondary'} className="text-xs">
                      {source.type}
                    </Badge>
                  </div>
                  {source.found && (
                    <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded text-sm border">
                      <pre className="text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-words">
                        {JSON.stringify(source.value, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Role Extraction Results */}
      {tokenDebugInfo && (
        <Card>
          <CardHeader>
            <CardTitle>Role Extraction Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <strong className="text-slate-800 dark:text-slate-200">All Extracted Roles ({tokenDebugInfo.extractedRoles.length}):</strong>
              {tokenDebugInfo.extractedRoles.length > 0 ? (
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm mt-2 border border-blue-200 dark:border-blue-800">
                  <pre className="text-blue-900 dark:text-blue-100 whitespace-pre-wrap break-words">
                    {JSON.stringify(tokenDebugInfo.extractedRoles, null, 2)}
                  </pre>
                </div>
              ) : (
                <Badge variant="destructive" className="ml-2">No roles extracted</Badge>
              )}
            </div>
            
            <div>
              <strong className="text-slate-800 dark:text-slate-200">Valid Manufacturing Roles ({tokenDebugInfo.validRoles.length}):</strong>
              {tokenDebugInfo.validRoles.length > 0 ? (
                <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded text-sm mt-2 border border-green-200 dark:border-green-800">
                  <pre className="text-green-900 dark:text-green-100 whitespace-pre-wrap break-words">
                    {JSON.stringify(tokenDebugInfo.validRoles, null, 2)}
                  </pre>
                </div>
              ) : (
                <Badge variant="destructive" className="ml-2">No valid manufacturing roles found</Badge>
              )}
            </div>
            
            <div>
              <strong className="text-slate-800 dark:text-slate-200">Expected Manufacturing Roles:</strong>
              <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded text-sm mt-2 border border-slate-200 dark:border-slate-700">
                <pre className="text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-words">
                  {JSON.stringify(Object.values(ManufacturingRole), null, 2)}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Token Claims */}
      {tokenDebugInfo && (
        <Card>
          <CardHeader>
            <CardTitle>Complete Token Claims</CardTitle>
            <CardDescription>
              All claims present in the Azure ID token
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded text-sm max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-700">
              <pre className="text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-words">
                {tokenDebugInfo.rawTokenClaims}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Troubleshooting Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Troubleshooting Guide</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-red-700 dark:text-red-400">If no roles are found in any source:</h4>
              <ol className="list-decimal list-inside text-sm space-y-1 ml-4 text-slate-700 dark:text-slate-300">
                <li>Check that app roles are created in your Azure app registration</li>
                <li>Verify users/groups are assigned to the app roles</li>
                <li>Ensure the app registration has the correct permissions</li>
                <li>Check that the roles claim is included in the token</li>
              </ol>
            </div>
            
            <div>
              <h4 className="font-semibold text-orange-700 dark:text-orange-400">If roles are found but not valid manufacturing roles:</h4>
              <ol className="list-decimal list-inside text-sm space-y-1 ml-4 text-slate-700 dark:text-slate-300">
                <li>Verify the role values in Azure match exactly with ManufacturingRole enum</li>
                <li>Check for typos or case sensitivity issues</li>
                <li>Ensure the role values use the correct format (e.g., &apos;e&amp;t.admin&apos;)</li>
              </ol>
            </div>

            <div>
              <h4 className="font-semibold text-blue-700 dark:text-blue-400">Azure App Registration Checklist:</h4>
              <ul className="list-disc list-inside text-sm space-y-1 ml-4 text-slate-700 dark:text-slate-300">
                <li>App roles created with exact values from ManufacturingRole enum</li>
                <li>Users/groups assigned to app roles in Enterprise Application</li>
                <li>Token configuration includes &apos;roles&apos; claim</li>
                <li>API permissions granted and admin consent provided</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 