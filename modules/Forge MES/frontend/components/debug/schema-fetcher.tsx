'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Download, Copy, CheckCircle, XCircle } from 'lucide-react'

interface SchemaData {
  type: string
  endpoint?: string
  schema?: Record<string, unknown>
  spec?: Record<string, unknown>
  error?: string
  timestamp: string
  attemptedEndpoints?: string[]
  graphql?: {
    available: boolean
    schema?: Record<string, unknown>
    error?: string
  }
  openapi?: {
    available: boolean
    spec?: Record<string, unknown>
    error?: string
  }
  endpoints?: {
    graphql: string
    api: string
  }
}

export function SchemaFetcher() {
  const [loading, setLoading] = useState(false)
  const [schemaData, setSchemaData] = useState<SchemaData | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const fetchSchema = async (type: 'graphql' | 'openapi' | 'swagger' | 'all') => {
    setLoading(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/schema?type=${type}`)
      const data = await response.json()
      setSchemaData(data)
      
      if (response.ok) {
        showMessage('success', `Retrieved ${type} schema information`)
      } else {
        showMessage('error', data.error || 'Unknown error occurred')
      }
    } catch (error) {
      showMessage('error', 'Failed to connect to schema endpoint')
      console.error('Schema fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async (data: Record<string, unknown>) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      showMessage('success', 'Schema data has been copied to your clipboard')
    } catch {
      showMessage('error', 'Failed to copy to clipboard')
    }
  }

  const downloadSchema = (data: Record<string, unknown>, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const renderSchemaContent = (data: Record<string, unknown>, title: string) => {
    if (!data) return <div className="text-muted-foreground">No data available</div>

    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyToClipboard(data)}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadSchema(data, `${title.toLowerCase().replace(' ', '-')}-schema.json`)}
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
        <div className="h-96 w-full rounded-md border p-4 overflow-auto">
          <pre className="text-sm whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    )
  }

  const renderStatus = (available: boolean, error?: string) => {
    if (available) {
      return (
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <Badge variant="default">Available</Badge>
        </div>
      )
    } else {
      return (
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-red-500" />
          <Badge variant="destructive">Unavailable</Badge>
          {error && <span className="text-sm text-muted-foreground">({error})</span>}
        </div>
      )
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>API Schema Fetcher</CardTitle>
          <CardDescription>
            Fetch OpenAPI specifications and GraphQL schemas from your backend services
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => fetchSchema('all')}
              disabled={loading}
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Fetch All Schemas
            </Button>
            <Button
              onClick={() => fetchSchema('graphql')}
              disabled={loading}
              variant="outline"
            >
              GraphQL Schema
            </Button>
            <Button
              onClick={() => fetchSchema('openapi')}
              disabled={loading}
              variant="outline"
            >
              OpenAPI Spec
            </Button>
          </div>
          
          {message && (
            <div className={`mt-4 p-3 rounded-md ${
              message.type === 'success' 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {message.text}
            </div>
          )}
        </CardContent>
      </Card>

      {schemaData && (
        <Card>
          <CardHeader>
            <CardTitle>Schema Results</CardTitle>
            <CardDescription>
              Fetched at: {new Date(schemaData.timestamp).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {schemaData.endpoints && (
              <div className="mb-4 p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Configured Endpoints:</h4>
                <div className="space-y-1 text-sm">
                  <div><strong>GraphQL:</strong> {schemaData.endpoints.graphql}</div>
                  <div><strong>REST API:</strong> {schemaData.endpoints.api}</div>
                </div>
              </div>
            )}

            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="graphql">GraphQL</TabsTrigger>
                <TabsTrigger value="openapi">OpenAPI</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">GraphQL Schema</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {schemaData.graphql ? (
                        renderStatus(schemaData.graphql.available, schemaData.graphql.error)
                      ) : schemaData.schema ? (
                        renderStatus(true)
                      ) : (
                        renderStatus(false, schemaData.error)
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">OpenAPI Specification</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {schemaData.openapi ? (
                        renderStatus(schemaData.openapi.available, schemaData.openapi.error)
                      ) : schemaData.spec ? (
                        renderStatus(true)
                      ) : (
                        renderStatus(false, schemaData.error)
                      )}
                    </CardContent>
                  </Card>
                </div>

                {schemaData.attemptedEndpoints && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Attempted Endpoints</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        {schemaData.attemptedEndpoints.map((endpoint, index) => (
                          <div key={index} className="text-sm font-mono bg-muted p-2 rounded">
                            {endpoint}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="graphql">
                <Card>
                  <CardHeader>
                    <CardTitle>GraphQL Schema</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {schemaData.graphql?.schema || schemaData.schema ? (
                      renderSchemaContent(
                        (schemaData.graphql?.schema || schemaData.schema) as Record<string, unknown>,
                        'GraphQL Schema'
                      )
                    ) : (
                      <div className="text-muted-foreground">
                        No GraphQL schema available. Error: {schemaData.graphql?.error || schemaData.error}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="openapi">
                <Card>
                  <CardHeader>
                    <CardTitle>OpenAPI Specification</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {schemaData.openapi?.spec || schemaData.spec ? (
                      renderSchemaContent(
                        (schemaData.openapi?.spec || schemaData.spec) as Record<string, unknown>,
                        'OpenAPI Spec'
                      )
                    ) : (
                      <div className="text-muted-foreground">
                        No OpenAPI specification available. Error: {schemaData.openapi?.error || schemaData.error}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 