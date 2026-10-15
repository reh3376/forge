'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { JWTLoginForm } from '../../components/auth/JWTLoginForm'
import { useJWTAuth } from '../../hooks/useJWTAuth'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { LogOut, CheckCircle } from 'lucide-react'

export default function JWTDemoPage() {
  const { isAuthenticated, user, logout } = useJWTAuth()

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">JWT Authentication Demo</h1>
            <p className="text-gray-600">Login with your backend credentials</p>
          </div>
          
          <JWTLoginForm />
          
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-500">
              Username: <code className="bg-gray-100 px-1 rounded">mes</code>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">JWT Authentication Demo</h1>
          <p className="text-gray-600">Successfully authenticated with JWT!</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Authentication Successful
            </CardTitle>
            <CardDescription>
              You are now logged in with JWT Bearer authentication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Username</p>
              <p className="text-lg">{user?.username}</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-500">Roles</p>
              <p className="text-lg">{user?.roles.join(', ')}</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-500">User ID</p>
              <p className="text-sm font-mono text-gray-700">{user?.id}</p>
            </div>

            <div className="pt-4">
              <Button onClick={logout} variant="outline" className="w-full">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integration Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>✅ JWT tokens are automatically included in API requests</p>
            <p>✅ Authentication state persists across page refreshes</p>
            <p>✅ Multi-tab support with localStorage sync</p>
            <p>✅ Automatic token expiration handling</p>
            <p>✅ Role-based permissions mapping</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 