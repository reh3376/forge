'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { JWTLoginForm } from '@/components/auth/JWTLoginForm'
import { useJWTAuth } from '@/hooks/useJWTAuth'
import { scheduleOrderQueueAPI } from '@/lib/api/schedule-order-queue'
import { toast } from 'sonner'
import { ChevronUp, ChevronDown, LogOut } from 'lucide-react'

export default function ScheduleQueueTestPage() {
  const { isAuthenticated, user, logout } = useJWTAuth()
  const [testResults, setTestResults] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const addTestResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`])
  }

  const testMoveUp = async () => {
    if (!user?.username) {
      toast.error('Please log in first')
      return
    }

    setIsLoading(true)
    addTestResult('🔄 Testing move up functionality...')

    try {
      // Test with a mock queue item ID and index
      const result = await scheduleOrderQueueAPI.moveUp(
        'test-queue-item-id',
        2, // current index
        user.username
      )

      if (result.error) {
        addTestResult(`❌ Move up failed: ${result.error}`)
        toast.error(`Move up failed: ${result.error}`)
      } else {
        addTestResult('✅ Move up API call successful (mock data)')
        toast.success('Move up API call successful')
      }
    } catch (error) {
      addTestResult(`🔥 Move up error: ${error}`)
      toast.error('Move up error - check console')
    } finally {
      setIsLoading(false)
    }
  }

  const testMoveDown = async () => {
    if (!user?.username) {
      toast.error('Please log in first')
      return
    }

    setIsLoading(true)
    addTestResult('🔄 Testing move down functionality...')

    try {
      // Test with a mock queue item ID and index
      const result = await scheduleOrderQueueAPI.moveDown(
        'test-queue-item-id',
        2, // current index
        5, // max index
        user.username
      )

      if (result.error) {
        addTestResult(`❌ Move down failed: ${result.error}`)
        toast.error(`Move down failed: ${result.error}`)
      } else {
        addTestResult('✅ Move down API call successful (mock data)')
        toast.success('Move down API call successful')
      }
    } catch (error) {
      addTestResult(`🔥 Move down error: ${error}`)
      toast.error('Move down error - check console')
    } finally {
      setIsLoading(false)
    }
  }

  const clearResults = () => {
    setTestResults([])
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto p-6 max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Schedule Queue Test - Login Required</CardTitle>
            <CardDescription>
              Please log in to test the schedule order queue move functionality
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JWTLoginForm />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Schedule Queue Test</h1>
          <p className="text-gray-600 mt-1">Test schedule order queue move functionality with JWT authentication</p>
        </div>
        <Button 
          onClick={logout}
          variant="outline"
          className="flex items-center gap-2"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>

      {/* User Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Authentication Status
            <Badge variant="default" className="bg-green-100 text-green-800">
              ✅ Authenticated
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-gray-600">Username:</p>
              <p>{user?.username}</p>
            </div>
            <div>
              <p className="font-medium text-gray-600">User ID:</p>
              <p>{user?.id}</p>
            </div>
            <div>
              <p className="font-medium text-gray-600">Roles:</p>
              <p>{user?.roles?.join(', ') || 'None'}</p>
            </div>
            <div>
              <p className="font-medium text-gray-600">Token Status:</p>
              <p className="text-green-600">Valid</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Test Schedule Queue Operations</CardTitle>
          <CardDescription>
            Test the move up/down functionality with authentication
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button 
              onClick={testMoveUp}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <ChevronUp className="h-4 w-4" />
              Test Move Up
            </Button>
            <Button 
              onClick={testMoveDown}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <ChevronDown className="h-4 w-4" />
              Test Move Down
            </Button>
            <Button 
              onClick={clearResults}
              variant="outline"
            >
              Clear Results
            </Button>
          </div>
          
          <div className="text-sm text-gray-600">
            <p><strong>Note:</strong> These tests use mock data since we don&apos;t have real queue items here.</p>
            <p>The tests verify that:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>JWT authentication headers are properly included</li>
              <li>API endpoints are accessible</li>
              <li>Error handling works correctly</li>
              <li>Success/failure responses are handled</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Test Results */}
      <Card>
        <CardHeader>
          <CardTitle>Test Results</CardTitle>
          <CardDescription>
            Real-time results from API calls
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 rounded-lg p-4 min-h-[200px] max-h-[400px] overflow-y-auto">
            {testResults.length === 0 ? (
              <p className="text-gray-500 italic">No test results yet. Click the test buttons above.</p>
            ) : (
              <div className="space-y-2">
                {testResults.map((result, index) => (
                  <div key={index} className="text-sm font-mono">
                    {result}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Testing Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm space-y-2">
            <h4 className="font-medium">Expected Behavior:</h4>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li><strong>When authenticated:</strong> API calls should succeed or return specific business logic errors</li>
              <li><strong>When not authenticated:</strong> API calls should return &quot;Unauthorized&quot; errors</li>
              <li><strong>Network errors:</strong> Should be caught and displayed appropriately</li>
            </ul>
          </div>
          
          <div className="text-sm space-y-2">
            <h4 className="font-medium">What to check:</h4>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>Browser console for detailed authentication logs</li>
              <li>Network tab for request headers (should include Authorization)</li>
              <li>Response status codes and error messages</li>
              <li>Toast notifications for user feedback</li>
            </ul>
          </div>
          
          <div className="text-sm space-y-2">
            <h4 className="font-medium">Next Steps:</h4>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>If tests pass here, try the real functionality on <code>/scheduling</code></li>
              <li>Look for actual queue items with real IDs to test with</li>
              <li>Verify that queue positions update correctly after moves</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 