'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react'

interface EnvVar {
  name: string
  value?: string
  required: boolean
  description: string
  category: 'auth' | 'database' | 'api' | 'general'
}

const envVars: EnvVar[] = [
  {
    name: 'NEXT_PUBLIC_AZURE_AD_CLIENT_ID',
    required: true,
    description: 'Azure AD Application Client ID',
    category: 'auth'
  },
  {
    name: 'NEXT_PUBLIC_AZURE_AD_TENANT_ID',
    required: true,
    description: 'Azure AD Tenant ID',
    category: 'auth'
  },
  {
    name: 'NEXT_PUBLIC_AZURE_REDIRECT_URI',
    required: true,
    description: 'Azure AD Redirect URI',
    category: 'auth'
  },
  {
    name: 'NEXT_PUBLIC_API_BASE_URL',
    required: false,
    description: 'Base URL for API calls',
    category: 'api'
  },
  {
    name: 'NEXT_PUBLIC_WS_URL',
    required: false,
    description: 'WebSocket connection URL',
    category: 'api'
  }
]

export default function EnvCheckPage() {
  // Get environment variables
  const checkEnvVars = envVars.map(envVar => ({
    ...envVar,
    value: process.env[envVar.name],
    isSet: !!process.env[envVar.name]
  }))

  const getStatusIcon = (isSet: boolean, required: boolean) => {
    if (isSet) {
      return <CheckCircle className="h-4 w-4 text-green-500" />
    } else if (required) {
      return <XCircle className="h-4 w-4 text-red-500" />
    } else {
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />
    }
  }

  const getStatusBadge = (isSet: boolean, required: boolean) => {
    if (isSet) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Set</Badge>
    } else if (required) {
      return <Badge variant="destructive">Missing</Badge>
    } else {
      return <Badge variant="secondary">Optional</Badge>
    }
  }

  const categories = Array.from(new Set(envVars.map(v => v.category)))

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Environment Check</h1>
          <p className="text-muted-foreground">
            Validate environment variables and configuration settings
          </p>
        </div>
      </div>

      {categories.map(category => {
        const categoryVars = checkEnvVars.filter(v => v.category === category)
        const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1)
        
        return (
          <Card key={category}>
            <CardHeader>
              <CardTitle>{categoryTitle} Configuration</CardTitle>
              <CardDescription>
                Environment variables for {category} functionality
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {categoryVars.map(envVar => (
                  <div key={envVar.name} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(envVar.isSet, envVar.required)}
                        <code className="text-sm font-mono">{envVar.name}</code>
                        {getStatusBadge(envVar.isSet, envVar.required)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{envVar.description}</p>
                      {envVar.isSet && envVar.value && (
                        <p className="text-xs text-muted-foreground mt-1 font-mono">
                          Value: {envVar.value.length > 50 ? `${envVar.value.substring(0, 50)}...` : envVar.value}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {checkEnvVars.filter(v => v.isSet).length}
              </div>
              <div className="text-sm text-muted-foreground">Variables Set</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {checkEnvVars.filter(v => v.required && !v.isSet).length}
              </div>
              <div className="text-sm text-muted-foreground">Required Missing</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {checkEnvVars.filter(v => !v.required && !v.isSet).length}
              </div>
              <div className="text-sm text-muted-foreground">Optional Missing</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 