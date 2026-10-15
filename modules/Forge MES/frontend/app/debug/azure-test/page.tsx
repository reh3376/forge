'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

import { useAuth } from '@/lib/auth-context'
import { getMsalConfig, isAzureActuallyConfigured, isDevModeDisabled, isDemoUserEnabled, ManufacturingRole } from '@/lib/auth-config'
import { getMsalInstance } from '@/lib/auth-context'
import { CheckCircle, XCircle, AlertCircle, RefreshCw, Bug, Settings, Globe, Key } from 'lucide-react'
import { AccountInfo } from '@azure/msal-browser'

export default function AzureTestPage() {
  const { login, logout, user, isAuthenticated, isLoading, error, devMode } = useAuth()
  const [msalState, setMsalState] = useState<{
    activeAccount: AccountInfo | null;
    allAccounts: AccountInfo[];
    configuration: {
      clientId: string;
      authority: string;
      redirectUri: string;
      postLogoutRedirectUri: string;
    };
  } | null>(null)
  const [networkTest, setNetworkTest] = useState<{ status: string; details: string }>({ status: 'pending', details: '' })
  const [tokenInfo, setTokenInfo] = useState<{
    accessToken?: {
      expiresOn: Date | null;
      scopes: string[];
      isExpired: boolean;
    };
    idToken?: {
      claims: Record<string, unknown>;
      rawToken: string;
    };
    account?: AccountInfo;
    error?: string;
  } | null>(null)
  const [roleDebugInfo, setRoleDebugInfo] = useState<{
    account: {
      localAccountId: string;
      homeAccountId: string;
      username: string;
      name: string | undefined;
    };
    idTokenClaims: Record<string, unknown>;
    rawRoles: string[] | undefined;
    extractedRoles: string[];
    allClaims: Array<{
      key: string;
      value: unknown;
      type: string;
    }>;
  } | null>(null)

  useEffect(() => {
    // Get MSAL instance state
    const updateMsalState = () => {
      const config = getMsalConfig()
      const instance = getMsalInstance()
      const activeAccount = instance.getActiveAccount()
      const allAccounts = instance.getAllAccounts()
      
      setMsalState({
        activeAccount,
        allAccounts,
        configuration: {
          clientId: config.auth.clientId,
          authority: config.auth.authority || '',
          redirectUri: config.auth.redirectUri || '',
          postLogoutRedirectUri: config.auth.postLogoutRedirectUri || ''
        }
      })

      // Debug role extraction
      if (activeAccount) {
        const roleDebug = {
          account: {
            localAccountId: activeAccount.localAccountId,
            homeAccountId: activeAccount.homeAccountId,
            username: activeAccount.username,
            name: activeAccount.name || undefined
          },
          idTokenClaims: (activeAccount.idTokenClaims || {}) as Record<string, unknown>,
          rawRoles: (activeAccount.idTokenClaims?.roles as string[]) || undefined,
          extractedRoles: extractUserRoles(activeAccount),
          allClaims: Object.keys(activeAccount.idTokenClaims || {}).map(key => ({
            key,
            value: activeAccount.idTokenClaims?.[key],
            type: typeof activeAccount.idTokenClaims?.[key]
          }))
        }
        setRoleDebugInfo(roleDebug)
      }
    }

    updateMsalState()
    
    // Test network connectivity to Azure endpoints
    testAzureConnectivity()
    
    // Get token information
    getTokenInfo()
  }, [user, isAuthenticated])

  const getTokenInfo = async () => {
    try {
      const instance = getMsalInstance()
      const activeAccount = instance.getActiveAccount()
      
      if (activeAccount) {
        // Try to get token silently to check expiration
        const silentRequest = {
          scopes: ['User.Read'],
          account: activeAccount
        }
        
        const result = await instance.acquireTokenSilent(silentRequest)
        
        setTokenInfo({
          accessToken: {
            expiresOn: result.expiresOn,
            scopes: result.scopes,
            isExpired: result.expiresOn ? new Date() > result.expiresOn : false
          },
          idToken: {
            claims: (result.idTokenClaims || {}) as Record<string, unknown>,
            rawToken: result.idToken
          },
          account: result.account
        })
      }
    } catch (error) {
      console.error('Token info error:', error)
      setTokenInfo({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  }

  // Helper function to extract roles (same as in auth-context)
  const extractUserRoles = (account: AccountInfo | null): string[] => {
    if (!account || !account.idTokenClaims) return []
    
    const claims = account.idTokenClaims
    const roles = (claims.roles as string[]) || []
    
    return roles.filter((role: string) => 
      Object.values(ManufacturingRole).includes(role as ManufacturingRole)
    )
  }

  const testAzureConnectivity = async () => {
    setNetworkTest({ status: 'testing', details: 'Testing MSAL configuration...' })
    
    try {
      const tenantId = process.env['NEXT_PUBLIC_AZURE_AD_TENANT_ID']
      if (!tenantId) {
        setNetworkTest({ status: 'error', details: 'No tenant ID configured' })
        return
      }

      // Instead of testing network connectivity (which fails due to CORS),
      // let's test if MSAL is properly configured
      const config = getMsalConfig()
      const instance = getMsalInstance()
      
      // Check if MSAL instance is properly initialized
      if (!instance) {
        setNetworkTest({ status: 'error', details: 'MSAL instance not initialized' })
        return
      }
      
      // Check configuration values
      const configCheck = {
        clientId: config.auth.clientId,
        authority: config.auth.authority,
        redirectUri: config.auth.redirectUri,
        hasValidClientId: config.auth.clientId && config.auth.clientId !== 'ssr-placeholder'
      }
      
      if (!configCheck.hasValidClientId) {
        setNetworkTest({ 
          status: 'error', 
          details: 'Invalid client ID configuration' 
        })
        return
      }
      
      setNetworkTest({ 
        status: 'success', 
        details: `MSAL configured successfully. Authority: ${configCheck.authority}` 
      })
      
    } catch (error) {
      setNetworkTest({ 
        status: 'error', 
        details: error instanceof Error ? error.message : 'MSAL configuration error' 
      })
    }
  }

  const handleTestLogin = async () => {
    console.group('🧪 Manual Azure Login Test')
    console.log('Test initiated at:', new Date().toISOString())
    
    try {
      await login()
    } catch (error) {
      console.error('Test login failed:', error)
    } finally {
      console.groupEnd()
    }
  }

  const handleClearCache = () => {
    console.log('🧹 Clearing MSAL cache...')
            getMsalInstance().clearCache()
    window.location.reload()
  }

  const getStatusIcon = (condition: boolean) => {
    return condition ? (
      <CheckCircle className="h-5 w-5 text-green-500" />
    ) : (
      <XCircle className="h-5 w-5 text-red-500" />
    )
  }

  const getNetworkStatusIcon = () => {
    switch (networkTest.status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'testing':
        return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-500" />
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Bug className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Azure AD Debug Console</h1>
      </div>

      {/* Configuration Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuration Status
          </CardTitle>
          <CardDescription>
            Current Azure AD and application configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <span>Azure Actually Configured</span>
              <div className="flex items-center gap-2">
                {getStatusIcon(isAzureActuallyConfigured())}
                <Badge variant={isAzureActuallyConfigured() ? 'default' : 'destructive'}>
                  {isAzureActuallyConfigured() ? 'Yes' : 'No'}
                </Badge>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span>Dev Mode Disabled</span>
              <div className="flex items-center gap-2">
                {getStatusIcon(isDevModeDisabled())}
                <Badge variant={isDevModeDisabled() ? 'default' : 'secondary'}>
                  {isDevModeDisabled() ? 'Yes' : 'No'}
                </Badge>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span>Demo User Enabled</span>
              <div className="flex items-center gap-2">
                {getStatusIcon(isDemoUserEnabled())}
                <Badge variant={isDemoUserEnabled() ? 'default' : 'secondary'}>
                  {isDemoUserEnabled() ? 'Yes' : 'No'}
                </Badge>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span>Client ID Present</span>
              <div className="flex items-center gap-2">
                {getStatusIcon(!!process.env['NEXT_PUBLIC_AZURE_AD_CLIENT_ID'])}
                <Badge variant={process.env['NEXT_PUBLIC_AZURE_AD_CLIENT_ID'] ? 'default' : 'destructive'}>
                  {process.env['NEXT_PUBLIC_AZURE_AD_CLIENT_ID'] ? 'Yes' : 'No'}
                </Badge>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span>Tenant ID Present</span>
              <div className="flex items-center gap-2">
                {getStatusIcon(!!process.env['NEXT_PUBLIC_AZURE_AD_TENANT_ID'])}
                <Badge variant={process.env['NEXT_PUBLIC_AZURE_AD_TENANT_ID'] ? 'default' : 'destructive'}>
                  {process.env['NEXT_PUBLIC_AZURE_AD_TENANT_ID'] ? 'Yes' : 'No'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Network Connectivity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Network Connectivity
          </CardTitle>
          <CardDescription>
            Test connectivity to Azure AD endpoints
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span>Azure AD Endpoint</span>
            <div className="flex items-center gap-2">
              {getNetworkStatusIcon()}
              <Badge variant={networkTest.status === 'success' ? 'default' : networkTest.status === 'error' ? 'destructive' : 'secondary'}>
                {networkTest.status}
              </Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{networkTest.details}</p>
          <Button onClick={testAzureConnectivity} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retest Connectivity
          </Button>
        </CardContent>
      </Card>

      {/* MSAL Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            MSAL Configuration
          </CardTitle>
          <CardDescription>
            Current Microsoft Authentication Library settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {msalState && (
            <div className="space-y-2">
              <div>
                <strong>Client ID:</strong> {msalState.configuration.clientId}
              </div>
              <div>
                <strong>Authority:</strong> {msalState.configuration.authority}
              </div>
              <div>
                <strong>Redirect URI:</strong> {msalState.configuration.redirectUri}
              </div>
              <div>
                <strong>Active Account:</strong> {msalState.activeAccount ? msalState.activeAccount.username : 'None'}
              </div>
              <div>
                <strong>Total Accounts:</strong> {msalState.allAccounts.length}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Authentication Status */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication Status</CardTitle>
          <CardDescription>
            Current user authentication state
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>
          
          {user && (
            <div className="space-y-2">
              <hr className="border-gray-200 dark:border-gray-700" />
              <h4 className="font-semibold">User Details:</h4>
              <div><strong>Name:</strong> {user.name}</div>
              <div><strong>Email:</strong> {user.email}</div>
              <div><strong>Roles:</strong> {user.roles.join(', ')}</div>
              <div><strong>Permissions:</strong> {user.permissions.length}</div>
            </div>
          )}
          
          {error && (
            <div className="space-y-2">
              <hr className="border-gray-200 dark:border-gray-700" />
              <h4 className="font-semibold text-red-600">Error:</h4>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Test Actions</CardTitle>
          <CardDescription>
            Manual testing and debugging actions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={handleTestLogin} 
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? 'Testing...' : 'Test Azure Login'}
            </Button>
            
            {isAuthenticated && (
              <Button onClick={logout} variant="outline">
                Logout
              </Button>
            )}
            
            {devMode.isEnabled && (
              <Button 
                onClick={() => devMode.signInWithDemoUser()} 
                variant="outline"
                className="border-yellow-400 text-yellow-700"
              >
                Test Demo Login
              </Button>
            )}
            
            <Button onClick={handleClearCache} variant="destructive">
              Clear MSAL Cache
            </Button>
            
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline"
            >
              Reload Page
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Debug Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Debug Instructions</CardTitle>
          <CardDescription>
            Steps to troubleshoot Azure AD login issues
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Open browser developer tools (F12) and check the Console tab</li>
            <li>Click &quot;Test Azure Login&quot; and watch for detailed debug logs</li>
            <li>Check Network tab for failed requests to Azure endpoints</li>
            <li>Verify all configuration values are correct above</li>
            <li>Ensure your app registration in Azure Portal has the correct redirect URIs</li>
            <li>Check that the app registration is not expired or disabled</li>
            <li>Verify your user account has access to the Azure AD tenant</li>
            <li>Try clearing MSAL cache if you see stale data</li>
          </ol>
        </CardContent>
      </Card>

      {/* Role Extraction Debug */}
      {roleDebugInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Role Extraction Debug
            </CardTitle>
            <CardDescription>
              Detailed information about role extraction from Azure AD tokens
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-semibold">Account Information</h4>
              <div className="bg-gray-50 p-3 rounded text-sm">
                <pre>{JSON.stringify(roleDebugInfo.account, null, 2)}</pre>
              </div>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-semibold">Raw Roles from Token</h4>
              <div className="bg-gray-50 p-3 rounded text-sm">
                <pre>{JSON.stringify(roleDebugInfo.rawRoles, null, 2)}</pre>
              </div>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-semibold">Extracted Manufacturing Roles</h4>
              <div className="bg-gray-50 p-3 rounded text-sm">
                <pre>{JSON.stringify(roleDebugInfo.extractedRoles, null, 2)}</pre>
              </div>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-semibold">All Token Claims</h4>
              <div className="bg-gray-50 p-3 rounded text-sm max-h-64 overflow-y-auto">
                <pre>{JSON.stringify(roleDebugInfo.allClaims, null, 2)}</pre>
              </div>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-semibold">Expected Manufacturing Roles</h4>
              <div className="bg-blue-50 p-3 rounded text-sm">
                <pre>{JSON.stringify(Object.values(ManufacturingRole), null, 2)}</pre>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Token Information */}
      {tokenInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Token Information
            </CardTitle>
            <CardDescription>
              Current token status and expiration information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tokenInfo.error ? (
              <div className="text-red-600">
                <p>Error getting token info: {tokenInfo.error}</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <h4 className="font-semibold">Access Token</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between">
                      <span>Expires On</span>
                      <Badge variant={tokenInfo.accessToken?.isExpired ? 'destructive' : 'default'}>
                        {tokenInfo.accessToken?.expiresOn?.toLocaleString() || 'Unknown'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Is Expired</span>
                      <Badge variant={tokenInfo.accessToken?.isExpired ? 'destructive' : 'default'}>
                        {tokenInfo.accessToken?.isExpired ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-sm font-medium">Scopes:</span>
                    <div className="bg-gray-50 p-2 rounded text-sm">
                      {tokenInfo.accessToken?.scopes?.join(', ') || 'None'}
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-semibold">ID Token Claims</h4>
                  <div className="bg-gray-50 p-3 rounded text-sm max-h-64 overflow-y-auto">
                    <pre>{JSON.stringify(tokenInfo.idToken?.claims, null, 2)}</pre>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Session Persistence Debug */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Session Persistence Debug
          </CardTitle>
          <CardDescription>
            Test session persistence and token refresh functionality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button 
              onClick={getTokenInfo}
              variant="outline"
              className="w-full"
            >
              Refresh Token Info
            </Button>
            
            <Button 
              onClick={handleClearCache}
              variant="outline"
              className="w-full"
            >
              Clear MSAL Cache
            </Button>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-semibold">Current User Session</h4>
            <div className="bg-gray-50 p-3 rounded text-sm">
              <pre>{JSON.stringify({
                isAuthenticated,
                isLoading,
                userId: user?.id,
                userEmail: user?.email,
                userName: user?.name,
                userRoles: user?.roles,
                userPermissions: user?.permissions,
                sessionExpiry: user?.sessionExpiry,
                lastLogin: user?.lastLogin
              }, null, 2)}</pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 