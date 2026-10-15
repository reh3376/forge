'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { isAzureConfigured } from '@/lib/auth-config'
import { Bug, Settings, Activity } from 'lucide-react'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

export default function DebugPage() {
  const auth = useAuth()
  
  const envVars = {
    // Azure AD variables (correct naming with _AD_)
    NEXT_PUBLIC_AZURE_AD_CLIENT_ID: process.env['NEXT_PUBLIC_AZURE_AD_CLIENT_ID'],
    NEXT_PUBLIC_AZURE_AD_TENANT_ID: process.env['NEXT_PUBLIC_AZURE_AD_TENANT_ID'],
    NEXT_PUBLIC_AZURE_REDIRECT_URI: process.env['NEXT_PUBLIC_AZURE_REDIRECT_URI'],
    NEXT_PUBLIC_AZURE_LOGOUT_URI: process.env['NEXT_PUBLIC_AZURE_LOGOUT_URI'],
    NEXT_PUBLIC_AZURE_AUTHORITY: process.env['NEXT_PUBLIC_AZURE_AUTHORITY'],
    // Dev mode controls
    NEXT_PUBLIC_DISABLE_DEV_MODE: process.env['NEXT_PUBLIC_DISABLE_DEV_MODE'],
    NEXT_PUBLIC_ENABLE_DEMO_USER: process.env['NEXT_PUBLIC_ENABLE_DEMO_USER'],
    NODE_ENV: process.env.NODE_ENV
  }
  
  const azureConfigured = isAzureConfigured()
  
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Debug Information
        </h1>
        <div className="flex gap-2">
          <Link href="/debug/health-monitoring">
            <Button variant="outline">
              <Activity className="h-4 w-4 mr-2" />
              Health Monitoring
            </Button>
          </Link>
          <Link href="/debug/azure-test">
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Bug className="h-4 w-4 mr-2" />
              Azure Debug Console
            </Button>
          </Link>
        </div>
      </div>
      
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Environment Variables</h2>
          <pre className="bg-gray-100 p-4 rounded text-sm">
            {JSON.stringify(envVars, null, 2)}
          </pre>
        </div>
        
        <div>
          <h2 className="text-lg font-semibold">Azure Configuration</h2>
          <p>Azure Configured: {azureConfigured ? 'Yes' : 'No'}</p>
        </div>
        
        <div>
          <h2 className="text-lg font-semibold">Auth State</h2>
          <pre className="bg-gray-100 p-4 rounded text-sm">
            {JSON.stringify({
              isAuthenticated: auth.isAuthenticated,
              isLoading: auth.isLoading,
              user: auth.user ? {
                name: auth.user.name,
                email: auth.user.email,
                roles: auth.user.roles
              } : null,
              devModeEnabled: auth.devMode.isEnabled,
              interactionInProgress: auth.interactionInProgress
            }, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
} 