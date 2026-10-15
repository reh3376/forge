'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import React from 'react'

export default function EnvCheckPage() {
  const envVars = [
    'NEXT_PUBLIC_AZURE_CLIENT_ID',
    'NEXT_PUBLIC_AZURE_TENANT_ID',
    'NEXT_PUBLIC_AZURE_REDIRECT_URI',
    'NEXT_PUBLIC_DISABLE_DEV_MODE',
    'NEXT_PUBLIC_ENABLE_DEMO_USER',
    'NEXT_PUBLIC_GRAPHQL_ENDPOINT',
    'NEXT_PUBLIC_WS_ENDPOINT'
  ]

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Environment Variables Check</h1>
      
      <div className="space-y-2">
        {envVars.map((envVar) => {
          const value = process.env[envVar]
          return (
            <div key={envVar} className="flex justify-between items-center p-2 border rounded">
              <span className="font-mono text-sm">{envVar}</span>
              <span className={`px-2 py-1 rounded text-xs ${
                value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {value ? 'Set' : 'Not Set'}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-8 p-4 bg-gray-100 rounded">
        <h2 className="text-lg font-semibold mb-2">Configuration Status</h2>
        <p><strong>JWT Authentication:</strong> Available</p>
        <p><strong>GraphQL Endpoint:</strong> {process.env['NEXT_PUBLIC_GRAPHQL_ENDPOINT'] || 'Not configured'}</p>
        <p><strong>WebSocket Endpoint:</strong> {process.env['NEXT_PUBLIC_WS_ENDPOINT'] || 'Not configured'}</p>
      </div>
    </div>
  )
} 