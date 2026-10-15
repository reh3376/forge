'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { isAzureActuallyConfigured, getEnvVar } from '@/lib/auth-config'

export default function SimpleTestPage() {
  // Test direct access (this always worked)
  const directClientId = process.env['NEXT_PUBLIC_AZURE_AD_CLIENT_ID']
  const directTenantId = process.env['NEXT_PUBLIC_AZURE_AD_TENANT_ID']
  
  // Test the FIXED getEnvVar function from auth-config
  const getEnvClientId = getEnvVar('NEXT_PUBLIC_AZURE_AD_CLIENT_ID')
  const getEnvTenantId = getEnvVar('NEXT_PUBLIC_AZURE_AD_TENANT_ID')
  
  // Test the actual auth-config function
  const azureConfigured = isAzureActuallyConfigured()
  
  // Test GUID validation
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const clientIdValid = directClientId && guidRegex.test(directClientId)
  const tenantIdValid = directTenantId && guidRegex.test(directTenantId)
  

  
  console.log('🔍 Environment Variable Access Test:')
  console.log('  Direct Access (always worked):', {
    clientId: directClientId ? 'present' : 'missing',
    tenantId: directTenantId ? 'present' : 'missing'
  })
  console.log('  Fixed getEnvVar (working now):', {
    clientId: getEnvClientId ? 'present' : 'missing',
    tenantId: getEnvTenantId ? 'present' : 'missing'
  })
  
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-green-600">✅ Environment Variable Fix - Working!</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Direct Access - Always Worked */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-green-800 mb-3">✅ Direct Access (Always Worked)</h2>
          <div className="space-y-2 text-sm">
            <p><span className="font-medium">Client ID:</span> {directClientId ? '✅ Present' : '❌ Missing'}</p>
            <p><span className="font-medium">Tenant ID:</span> {directTenantId ? '✅ Present' : '❌ Missing'}</p>
                         <p className="text-xs text-green-600 mt-2">Uses: process.env[&apos;LITERAL_STRING&apos;]</p>
          </div>
        </div>

        {/* Fixed getEnvVar - Should Work Now */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-blue-800 mb-3">🔧 Fixed getEnvVar Function</h2>
          <div className="space-y-2 text-sm">
            <p><span className="font-medium">Client ID:</span> {getEnvClientId ? '✅ Present' : '❌ Missing'}</p>
            <p><span className="font-medium">Tenant ID:</span> {getEnvTenantId ? '✅ Present' : '❌ Missing'}</p>
            <p className="text-xs text-blue-600 mt-2">Uses: CLIENT_ENV_VARS mapping</p>
          </div>
        </div>



        {/* Azure Configuration Test */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-purple-800 mb-3">🔐 Azure Configuration Test</h2>
          <div className="space-y-2 text-sm">
            <p><span className="font-medium">Client ID Valid:</span> {clientIdValid ? '✅ Yes' : '❌ No'}</p>
            <p><span className="font-medium">Tenant ID Valid:</span> {tenantIdValid ? '✅ Yes' : '❌ No'}</p>
            <p><span className="font-medium">Azure Configured:</span> {azureConfigured ? '✅ Yes' : '❌ No'}</p>
            <p className="text-xs text-purple-600 mt-2">Uses: isAzureActuallyConfigured()</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-8 p-6 bg-gray-50 border border-gray-200 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">🎯 Test Results Summary</h2>
        
        {getEnvClientId && getEnvTenantId ? (
          <div className="bg-green-100 border border-green-300 rounded p-4">
            <h3 className="font-semibold text-green-800">✅ SUCCESS: Environment Variable Fix Working!</h3>
            <p className="text-green-700 mt-2">
              The getEnvVar function is now correctly accessing environment variables on the client-side.
              Azure AD configuration should work properly now.
            </p>
          </div>
        ) : (
          <div className="bg-red-100 border border-red-300 rounded p-4">
            <h3 className="font-semibold text-red-800">❌ ISSUE: Environment Variables Still Not Working</h3>
            <p className="text-red-700 mt-2">
              The getEnvVar function is still not working. Check the console for detailed debugging information.
            </p>
          </div>
        )}

        <div className="mt-4 text-sm text-gray-600">
          <p><strong>Environment:</strong> {typeof window !== 'undefined' ? 'Client-side' : 'Server-side'}</p>
          <p><strong>Check Console:</strong> Detailed debugging logs are available in the browser console</p>
        </div>
      </div>
    </div>
  )
} 