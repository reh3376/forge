'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { tokenManager } from '@/lib/token-management'
import { useAuth } from '@/lib/auth-context'

interface TokenInspectionResult {
  hasTokens: boolean
  tokenCount: number
  tokens: Array<{
    key: string
    type: 'account' | 'idtoken' | 'accesstoken' | 'refreshtoken' | 'clientinfo' | 'unknown'
    isExpired?: boolean
    expiresIn?: number
    expirationDate?: string
    claims?: Record<string, unknown>
    size: number
    accountId?: string
    username?: string
  }>
  summary: {
    totalSize: number
    hasValidTokens: boolean
    hasExpiredTokens: boolean
    oldestToken?: string
    newestToken?: string
  }
  error?: string
}

export default function TokenInspectionPage() {
  const { isAuthenticated, account, user } = useAuth()
  const [inspectionResult, setInspectionResult] = useState<TokenInspectionResult | null>(null)
  const [isInspecting, setIsInspecting] = useState(false)

  const runInspection = () => {
    setIsInspecting(true)
    try {
      // First, let's see what's actually in localStorage
      console.group('🔍 Raw localStorage inspection')
      const allKeys = Object.keys(localStorage)
      console.log('All localStorage keys:', allKeys)
      
      const msalKeys = allKeys.filter(key => 
        key.toLowerCase().includes('msal') || 
        key.includes('3238411a-cc4b-420c-91d8-14ff6e99d60b') || // client ID
        key.includes('1f456c44-0bff-47fd-8bfd-9d8fe7dcf07a')    // tenant ID
      )
      console.log('MSAL-related keys:', msalKeys)
      
      msalKeys.forEach(key => {
        const value = localStorage.getItem(key)
        console.log(`Key: ${key}`)
        console.log(`Value length: ${value?.length || 0}`)
        console.log(`Value preview: ${value?.substring(0, 200)}...`)
        try {
          const parsed = JSON.parse(value || '{}')
          console.log('Parsed structure:', Object.keys(parsed))
        } catch {
          console.log('Not JSON or parse error')
        }
        console.log('---')
      })
      console.groupEnd()
      
      // Additional MSAL debugging
      console.group('🔍 MSAL Account Detection Debug')
      try {
        // Check what MSAL thinks about the current cache
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msalInstance = (window as any).msalInstance
        if (msalInstance && typeof msalInstance.getAllAccounts === 'function') {
          const accounts = msalInstance.getAllAccounts()
          console.log('MSAL getAllAccounts() result:', accounts)
          console.log('MSAL getAllAccounts() length:', accounts.length)
          
          // Check if there's an active account
          if (typeof msalInstance.getActiveAccount === 'function') {
            const activeAccount = msalInstance.getActiveAccount()
            console.log('MSAL getActiveAccount() result:', activeAccount)
          }
          
          // Check the cache directly
          if (typeof msalInstance.getTokenCache === 'function') {
            const cache = msalInstance.getTokenCache()
            console.log('MSAL cache object:', cache)
          }
        } else {
          console.log('MSAL instance not found on window object or missing methods')
        }
      } catch (error) {
        console.error('Error during MSAL debugging:', error)
      }
      console.groupEnd()
      
      const result = tokenManager.inspectLocalStorageTokens()
      setInspectionResult(result)
    } catch (error) {
      console.error('Error during token inspection:', error)
      setInspectionResult({ 
        hasTokens: false,
        tokenCount: 0,
        tokens: [],
        summary: {
          totalSize: 0,
          hasValidTokens: false,
          hasExpiredTokens: false
        },
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
    } finally {
      setIsInspecting(false)
    }
  }

  const cleanupExpiredTokens = () => {
    try {
      const result = tokenManager.cleanupExpiredTokens()
      console.log('Cleanup result:', result)
      // Re-run inspection after cleanup
      runInspection()
    } catch (error) {
      console.error('Error during token cleanup:', error)
    }
  }

  useEffect(() => {
    // Run inspection on page load
    runInspection()
  }, [])

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">MSAL Token Inspection</h1>
        <p className="text-gray-600">
          Debug MSAL token persistence by inspecting localStorage contents and token freshness.
        </p>
      </div>

      {/* Current Auth Status */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold mb-2">Current Authentication Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <span className="font-medium">Authenticated:</span>
            <span className={`ml-2 px-2 py-1 rounded text-sm ${
              isAuthenticated ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {isAuthenticated ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span className="font-medium">User:</span>
            <span className="ml-2">{user?.name || 'None'}</span>
          </div>
          <div>
            <span className="font-medium">Account ID:</span>
            <span className="ml-2 text-sm">{account?.localAccountId || 'None'}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={runInspection}
          disabled={isInspecting}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg"
        >
          {isInspecting ? 'Inspecting...' : 'Refresh Inspection'}
        </button>
        <button
          onClick={cleanupExpiredTokens}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg"
        >
          Clean Up Expired Tokens
        </button>
        <button
          onClick={() => {
            localStorage.clear()
            runInspection()
          }}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
        >
          Clear All localStorage
        </button>
      </div>

      {/* Inspection Results */}
      {inspectionResult && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Token Storage Summary</h2>
            
            {inspectionResult.error ? (
              <div className="bg-red-50 border border-red-200 rounded p-4">
                <p className="text-red-800">Error: {inspectionResult.error}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-4 rounded">
                  <div className="text-2xl font-bold text-blue-600">{inspectionResult.tokenCount}</div>
                  <div className="text-sm text-gray-600">Total MSAL Keys</div>
                </div>
                <div className="bg-gray-50 p-4 rounded">
                  <div className="text-2xl font-bold text-green-600">
                    {Math.round(inspectionResult.summary.totalSize / 1024 * 100) / 100}KB
                  </div>
                  <div className="text-sm text-gray-600">Storage Size</div>
                </div>
                <div className="bg-gray-50 p-4 rounded">
                  <div className={`text-2xl font-bold ${
                    inspectionResult.summary.hasValidTokens ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {inspectionResult.summary.hasValidTokens ? 'Yes' : 'No'}
                  </div>
                  <div className="text-sm text-gray-600">Has Valid Tokens</div>
                </div>
                <div className="bg-gray-50 p-4 rounded">
                  <div className={`text-2xl font-bold ${
                    inspectionResult.summary.hasExpiredTokens ? 'text-orange-600' : 'text-green-600'
                  }`}>
                    {inspectionResult.summary.hasExpiredTokens ? 'Yes' : 'No'}
                  </div>
                  <div className="text-sm text-gray-600">Has Expired Tokens</div>
                </div>
              </div>
            )}

            {inspectionResult.summary?.oldestToken && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="font-medium">Oldest Token:</span>
                  <div className="text-sm text-gray-600">
                    {new Date(inspectionResult.summary.oldestToken).toLocaleString()}
                  </div>
                </div>
                <div>
                  <span className="font-medium">Newest Token:</span>
                  <div className="text-sm text-gray-600">
                    {inspectionResult.summary.newestToken ? 
                      new Date(inspectionResult.summary.newestToken).toLocaleString() : 'N/A'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Token Details */}
          {inspectionResult.tokens && inspectionResult.tokens.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Token Details</h2>
              <div className="space-y-4">
                {inspectionResult.tokens.map((token, index: number) => (
                  <div key={index} className="border border-gray-100 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          token.type === 'idtoken' ? 'bg-blue-100 text-blue-800' :
                          token.type === 'account' ? 'bg-green-100 text-green-800' :
                          token.type === 'accesstoken' ? 'bg-purple-100 text-purple-800' :
                          token.type === 'refreshtoken' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {token.type.toUpperCase()}
                        </span>
                        {token.isExpired !== undefined && (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            token.isExpired ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                          }`}>
                            {token.isExpired ? 'EXPIRED' : 'VALID'}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {Math.round(token.size / 1024 * 100) / 100}KB
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-600 mb-2">
                      Key: {token.key.substring(0, 80)}...
                    </div>

                    {token.username && (
                      <div className="text-sm">
                        <span className="font-medium">Username:</span> {token.username}
                      </div>
                    )}

                    {token.accountId && (
                      <div className="text-sm">
                        <span className="font-medium">Account ID:</span> {token.accountId}
                      </div>
                    )}

                    {token.expirationDate && (
                      <div className="text-sm">
                        <span className="font-medium">Expires:</span> {new Date(token.expirationDate).toLocaleString()}
                        {token.expiresIn !== undefined && (
                          <span className="ml-2 text-gray-500">
                            ({Math.round(token.expiresIn / 60)} minutes)
                          </span>
                        )}
                      </div>
                    )}

                    {token.claims && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm font-medium text-blue-600">
                          View Claims
                        </summary>
                        <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-auto max-h-40">
                          {JSON.stringify(token.claims, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-2">How to Test Token Persistence</h2>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Ensure you have valid Azure AD configuration in .env.local</li>
              <li>Login with Azure AD (not demo mode)</li>
              <li>Check that you see valid ID tokens in the inspection above</li>
              <li>Close the browser tab and reopen it</li>
              <li>The application should automatically restore your session without requiring login</li>
              <li>If tokens are expired, they should be automatically cleaned up</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  )
} 