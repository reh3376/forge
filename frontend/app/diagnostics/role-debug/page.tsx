'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { ManufacturingRole, ManufacturingPermission } from '@/lib/auth-config'
import { Shield, Users, CheckCircle, XCircle } from 'lucide-react'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

export default function RoleDebugPage() {
  const { user, isAuthenticated, devMode } = useAuth()

  const allRoles = Object.values(ManufacturingRole)
  const allPermissions = Object.values(ManufacturingPermission)

  const userRoles = user?.roles || []
  const userPermissions = user?.permissions || []

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Role & Permissions Debug</h1>
          <p className="text-muted-foreground">
            Debug user roles and permission assignments
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Shield className="h-5 w-5 text-blue-500" />
          <span className="text-sm text-muted-foreground">
            {isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
          </span>
        </div>
      </div>

      {!isAuthenticated && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <span>Not Authenticated</span>
            </CardTitle>
            <CardDescription>
              You must be logged in to view role and permission information.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {devMode.isEnabled && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Dev mode is enabled. You can sign in with demo users:</p>
                <div className="flex flex-wrap gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => devMode.signInWithDemoUser(ManufacturingRole.ET_ADMIN)}
                  >
                    Demo Admin
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => devMode.signInWithDemoUser(ManufacturingRole.OPS_DISTILLERY_SUPERVISOR)}
                  >
                    Demo Supervisor
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => devMode.signInWithDemoUser(ManufacturingRole.OPS_DISTILLERY_OPERATOR)}
                  >
                    Demo Operator
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isAuthenticated && user && (
        <>
          {/* Current User Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span>Current User</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><strong>Name:</strong> {user.name}</div>
                <div><strong>Email:</strong> {user.email}</div>
                <div><strong>ID:</strong> {user.id}</div>
                <div><strong>Department:</strong> {user.department || 'Not set'}</div>
              </div>
            </CardContent>
          </Card>

          {/* User Roles */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>User Roles ({userRoles.length})</span>
              </CardTitle>
              <CardDescription>
                Roles assigned to the current user
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {userRoles.length > 0 ? (
                    userRoles.map(role => (
                      <Badge key={role} variant="default">{role}</Badge>
                    ))
                  ) : (
                    <Badge variant="secondary">No roles assigned</Badge>
                  )}
                </div>
                
                <div>
                  <h4 className="font-semibold mb-2">All Available Roles:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {allRoles.map(role => (
                      <div key={role} className="flex items-center justify-between p-2 border rounded">
                        <span className="text-sm font-mono">{role}</span>
                        {userRoles.includes(role) ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-gray-300" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* User Permissions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>User Permissions ({userPermissions.length})</span>
              </CardTitle>
              <CardDescription>
                Permissions granted to the current user
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {userPermissions.length > 0 ? (
                    userPermissions.slice(0, 20).map(permission => (
                      <Badge key={permission} variant="outline">{permission}</Badge>
                    ))
                  ) : (
                    <Badge variant="secondary">No permissions assigned</Badge>
                  )}
                  {userPermissions.length > 20 && (
                    <Badge variant="secondary">+{userPermissions.length - 20} more</Badge>
                  )}
                </div>
                
                <div>
                  <h4 className="font-semibold mb-2">All Available Permissions:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                    {allPermissions.map(permission => (
                      <div key={permission} className="flex items-center justify-between p-2 border rounded">
                        <span className="text-xs font-mono">{permission}</span>
                        {userPermissions.includes(permission) ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-gray-300" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{userRoles.length}</div>
                  <div className="text-sm text-muted-foreground">Assigned Roles</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{userPermissions.length}</div>
                  <div className="text-sm text-muted-foreground">Granted Permissions</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600">{allRoles.length}</div>
                  <div className="text-sm text-muted-foreground">Total Roles</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600">{allPermissions.length}</div>
                  <div className="text-sm text-muted-foreground">Total Permissions</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
} 