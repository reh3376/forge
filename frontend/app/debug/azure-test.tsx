'use client'

import { useEffect, useState } from 'react'
import { PublicClientApplication } from '@azure/msal-browser'
import { getMsalConfig, isAzureActuallyConfigured } from '@/lib/auth-config'

interface TestResults {
  envVars?: {
    clientId: string
    tenantId: string
    disableDevMode: string
    enableDemoUser: string
  }
  azureConfigured?: boolean
  msalConfig?: {
    clientId: string
    authority: string | undefined
    redirectUri: string | undefined
  }
  msalInit?: string
  accounts?: {
    count: number
    accounts: Array<{ username: string; name: string | undefined }>
  }
}

export default function AzureTestPage() {
  const [testResults, setTestResults] = useState<TestResults>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const runTests = async () => {
      const results: TestResults = {}
      
      // Test 1: Environment Variables
      results.envVars = {
        clientId: process.env['NEXT_PUBLIC_AZURE_AD_CLIENT_ID'] || 'MISSING',
        tenantId: process.env['NEXT_PUBLIC_AZURE_AD_TENANT_ID'] || 'MISSING',
        disableDevMode: process.env['NEXT_PUBLIC_DISABLE_DEV_MODE'] || 'MISSING',
        enableDemoUser: process.env['NEXT_PUBLIC_ENABLE_DEMO_USER'] || 'MISSING'
      }
      
      // Test 2: Azure Configuration Check
      results.azureConfigured = isAzureActuallyConfigured()
      
      // Test 3: MSAL Configuration
      const config = getMsalConfig()
      results.msalConfig = {
        clientId: config.auth.clientId,
        authority: config.auth.authority,
        redirectUri: config.auth.redirectUri
      }
      
      // Test 4: Try to initialize MSAL
      try {
        const msalInstance = new PublicClientApplication(config)
        await msalInstance.initialize()
        results.msalInit = 'SUCCESS'
        
        // Test 5: Try to get accounts
        const accounts = msalInstance.getAllAccounts()
        results.accounts = {
          count: accounts.length,
          accounts: accounts.map(acc => ({
            username: acc.username,
            name: acc.name
          }))
        }
        
      } catch (error) {
        results.msalInit = `ERROR: ${error}`
      }
      
      setTestResults(results)
      setLoading(false)
    }
    
    runTests()
  }, [])

  if (loading) {
    return <div className="p-8">Running Azure AD tests...</div>
  }

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Azure AD Connection Test</h1>
      
      <div className="space-y-4">
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">Environment Variables</h2>
          <pre className="text-sm">{JSON.stringify(testResults.envVars, null, 2)}</pre>
        </div>
        
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">Azure Configured</h2>
          <p className={testResults.azureConfigured ? 'text-green-600' : 'text-red-600'}>
            {testResults.azureConfigured ? '✅ YES' : '❌ NO'}
          </p>
        </div>
        
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">MSAL Configuration</h2>
          <pre className="text-sm">{JSON.stringify(testResults.msalConfig, null, 2)}</pre>
        </div>
        
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">MSAL Initialization</h2>
          <p className={testResults.msalInit === 'SUCCESS' ? 'text-green-600' : 'text-red-600'}>
            {testResults.msalInit}
          </p>
        </div>
        
        {testResults.accounts && (
          <div className="bg-gray-100 p-4 rounded">
            <h2 className="text-lg font-semibold mb-2">Current Accounts</h2>
            <pre className="text-sm">{JSON.stringify(testResults.accounts, null, 2)}</pre>
          </div>
        )}
      </div>
      
      <div className="mt-8 p-4 bg-blue-50 rounded">
        <h3 className="font-semibold mb-2">Next Steps:</h3>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>If MSAL initialization fails, check your Azure app registration settings</li>
          <li>Verify redirect URIs match exactly (no trailing slashes)</li>
          <li>Ensure app is configured as Single-page application (SPA)</li>
          <li>Check that API permissions are granted</li>
        </ul>
      </div>
    </div>
  )
} 