'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { testDirectConnection } from '@/lib/api/direct-graphql-client'

export function DirectGraphQLTest() {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleTest = async () => {
    setTesting(true)
    setResult(null)
    
    try {
      const success = await testDirectConnection()
      setResult({
        success,
        message: success 
          ? 'Direct GraphQL connection successful!' 
          : 'Direct GraphQL connection failed - check console for details'
      })
    } catch (error) {
      setResult({
        success: false,
        message: `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Direct GraphQL Connection Test</CardTitle>
        <CardDescription>
          Test the direct connection to localhost:8000/graphql (bypassing proxy)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={handleTest} 
          disabled={testing}
          className="w-full"
        >
          {testing ? 'Testing Connection...' : 'Test Direct Connection'}
        </Button>
        
        {result && (
          <div className="space-y-2">
            <Badge variant={result.success ? 'default' : 'destructive'}>
              {result.success ? 'Success' : 'Failed'}
            </Badge>
            <p className="text-sm text-muted-foreground">
              {result.message}
            </p>
          </div>
        )}
        
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>Target URL:</strong> http://localhost:8000/graphql</p>
          <p><strong>Authentication:</strong> None (direct connection)</p>
          <p><strong>Proxy:</strong> Bypassed</p>
        </div>
      </CardContent>
    </Card>
  )
} 