'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { scheduleOrderQueueAPI } from '@/lib/api/schedule-order-queue'

export default function RestProxyTestPage() {
  const [results, setResults] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [queueItemId, setQueueItemId] = useState('')
  const [queueIndex, setQueueIndex] = useState('')

  const addToResults = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setResults(prev => `${prev}\n[${timestamp}] ${message}`)
  }

  const testRestProxy = async () => {
    setLoading(true)
    addToResults('🔄 Testing REST proxy with basic fetch...')
    
    try {
      const response = await fetch('/api/rest/scheduleOrderQueues', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (response.ok) {
        const data = await response.json()
        addToResults(`✅ REST proxy working: Got ${data.length || 'unknown'} items`)
      } else {
        addToResults(`❌ REST proxy error: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      addToResults(`❌ REST proxy exception: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const testMoveUp = async () => {
    if (!queueItemId) {
      addToResults('❌ Please enter a Queue Item ID')
      return
    }

    setLoading(true)
    addToResults(`🔄 Testing moveUp via REST proxy for item ${queueItemId}...`)
    
    try {
      const currentIndex = queueIndex ? parseInt(queueIndex) : 1
      const result = await scheduleOrderQueueAPI.moveUp(
        queueItemId,
        currentIndex,
        'test-user'
      )
      
      if (result.error) {
        addToResults(`❌ Error: ${result.error}`)
      } else {
        addToResults(`✅ Success: Moved up to index ${result.data?.queueIndex}`)
      }
    } catch (error) {
      addToResults(`❌ Exception: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const testMoveDown = async () => {
    if (!queueItemId) {
      addToResults('❌ Please enter a Queue Item ID')
      return
    }

    setLoading(true)
    addToResults(`🔄 Testing moveDown via REST proxy for item ${queueItemId}...`)
    
    try {
      const currentIndex = queueIndex ? parseInt(queueIndex) : 0
      const result = await scheduleOrderQueueAPI.moveDown(
        queueItemId,
        currentIndex,
        10, // max index
        'test-user'
      )
      
      if (result.error) {
        addToResults(`❌ Error: ${result.error}`)
      } else {
        addToResults(`✅ Success: Moved down to index ${result.data?.queueIndex}`)
      }
    } catch (error) {
      addToResults(`❌ Exception: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const clearResults = () => {
    setResults('')
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">REST Proxy Test</h1>
        <p className="text-muted-foreground mt-2">
          Test the new REST API proxy for schedule order queue operations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Test Controls</CardTitle>
            <CardDescription>
              Configure and run tests for the REST proxy
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="queueItemId">Queue Item ID</Label>
              <Input
                id="queueItemId"
                value={queueItemId}
                onChange={(e) => setQueueItemId(e.target.value)}
                placeholder="Enter queue item ID for move operations"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="queueIndex">Current Queue Index</Label>
              <Input
                id="queueIndex"
                value={queueIndex}
                onChange={(e) => setQueueIndex(e.target.value)}
                placeholder="Enter current queue index"
                type="number"
              />
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Button 
                onClick={testRestProxy} 
                disabled={loading}
                variant="outline"
              >
                Test REST Proxy Connection
              </Button>
              
              <Button 
                onClick={testMoveUp} 
                disabled={loading || !queueItemId}
              >
                Test Move Up
              </Button>
              
              <Button 
                onClick={testMoveDown} 
                disabled={loading || !queueItemId}
              >
                Test Move Down
              </Button>
              
              <Button 
                onClick={clearResults} 
                variant="outline"
              >
                Clear Results
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
            <CardDescription>
              Output from REST proxy tests
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={results}
              readOnly
              className="min-h-[400px] font-mono text-sm"
              placeholder="Test results will appear here..."
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>REST Proxy Information</CardTitle>
          <CardDescription>
            Details about the REST proxy implementation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-semibold">Proxy Endpoint</h4>
                <code className="text-sm bg-muted p-2 rounded block">
                  /api/rest/[...path]
                </code>
                <p className="text-sm text-muted-foreground">
                  Forwards requests to the backend with proper authentication
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold">Authentication</h4>
                <code className="text-sm bg-muted p-2 rounded block">
                  JWT + Development Headers
                </code>
                <p className="text-sm text-muted-foreground">
                  Automatically adds auth headers like the GraphQL proxy
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold">Supported Methods</h4>
                <code className="text-sm bg-muted p-2 rounded block">
                  GET, POST, PUT, PATCH, DELETE
                </code>
                <p className="text-sm text-muted-foreground">
                  All HTTP methods are supported with proper forwarding
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold">Error Handling</h4>
                <code className="text-sm bg-muted p-2 rounded block">
                  Status + Error Forwarding
                </code>
                <p className="text-sm text-muted-foreground">
                  Preserves backend error responses and status codes
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 