'use client'

import React from 'react'
import { useAuth } from '@/lib/auth-context'
import { RBACService, PERMISSION_CATEGORIES } from '@/lib/rbac'
import { ManufacturingRole, ManufacturingPermission } from '@/lib/auth-config'
import { 
  ManufacturingRoleGuard,
  PermissionButton,
  ManufacturingFeatureFlag,
  FactoryStatusIndicator,
  RoleAccessIndicator
} from '@/components/ui/permission-aware'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Shield, 
  User, 
  Settings, 
  Factory, 
  Eye, 
  Edit, 
  Plus, 
  CheckCircle,
  XCircle,
  BarChart3,
  Clock,
  Building,
  Mail,
  IdCard,
  Calendar,
  Activity
} from 'lucide-react'

interface UserDetailViewProps {
  className?: string
  showHeader?: boolean
  compact?: boolean
}

export function UserDetailView({ 
  className = "", 
  showHeader = true, 
  compact = false 
}: UserDetailViewProps) {
  const { 
    user, 
    getEffectivePermissions,
    getHighestRole,
    validateAccess
  } = useAuth()

  if (!user) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-center">
          <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No user information available</p>
        </div>
      </div>
    )
  }

  const userRoles = user.roles || []
  const userPermissions = getEffectivePermissions()
  const highestRole = getHighestRole()

  // Permission validation examples
  const productionAccess = validateAccess([ManufacturingPermission.VIEW_PRODUCTION])
  const recipeEditAccess = validateAccess([ManufacturingPermission.EDIT_RECIPES])
  const adminAccess = validateAccess([
    ManufacturingPermission.MANAGE_USERS, 
    ManufacturingPermission.SYSTEM_SETTINGS
  ], true)

  return (
    <div className={`space-y-6 ${className}`}>
      {showHeader && (
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">User Details & Permissions</h2>
            <p className="text-muted-foreground">
              Comprehensive view of user access and capabilities
            </p>
          </div>
        </div>
      )}

      <div className={`grid gap-6 ${compact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
        {/* User Profile Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IdCard className="h-5 w-5" />
              Profile Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-lg">{user.name}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {user.email}
                </p>
              </div>
            </div>
            
            <div className="border-t border-border" />
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">User ID</p>
                <p className="text-sm font-mono">{user.id}</p>
              </div>
              {user.department && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Department</p>
                  <p className="text-sm flex items-center gap-1">
                    <Building className="h-3 w-3" />
                    {user.department}
                  </p>
                </div>
              )}
              {user.shift && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Shift</p>
                  <p className="text-sm flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {user.shift}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-muted-foreground">Last Login</p>
                <p className="text-sm flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date().toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Role & Access Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Access Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Assigned Roles</p>
              <div className="flex flex-wrap gap-2">
                {userRoles.map((role) => {
                  const roleInfo = RBACService.getRoleDisplayInfo(role)
                  return (
                    <Badge key={role} variant={roleInfo.badge}>
                      {roleInfo.label}
                    </Badge>
                  )
                })}
              </div>
            </div>
            
            <div className="border-t border-border" />
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Highest Role</p>
                <p className="text-sm font-semibold">
                  {highestRole ? RBACService.getRoleDisplayInfo(highestRole).label : 'None'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Permissions</p>
                <p className="text-sm font-semibold flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  {userPermissions.length}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Quick Access Status</p>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>Production Access</span>
                  {productionAccess.hasAccess ? (
                    <CheckCircle className="h-3 w-3 text-green-600" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-600" />
                  )}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>Recipe Management</span>
                  {recipeEditAccess.hasAccess ? (
                    <CheckCircle className="h-3 w-3 text-green-600" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-600" />
                  )}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>Admin Functions</span>
                  {adminAccess.hasAccess ? (
                    <CheckCircle className="h-3 w-3 text-green-600" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-600" />
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Permission Categories */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Permissions</CardTitle>
          <CardDescription>
            Comprehensive breakdown of access rights across all manufacturing operations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(PERMISSION_CATEGORIES).map(([category, permissions]) => {
              const hasAccess = RBACService.canAccessCategory(userRoles, category as keyof typeof PERMISSION_CATEGORIES)
              const userCategoryPermissions = permissions.filter(permission => 
                userPermissions.includes(permission)
              )
              
              return (
                <div key={category} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">{category}</h4>
                    {hasAccess ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div 
                        className="bg-primary rounded-full h-2 transition-all"
                        style={{ 
                          width: `${(userCategoryPermissions.length / permissions.length) * 100}%` 
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {userCategoryPermissions.length}/{permissions.length}
                    </span>
                  </div>
                  
                  <div className="space-y-1">
                    {permissions.slice(0, compact ? 3 : permissions.length).map((permission) => {
                      const hasPermission = userPermissions.includes(permission)
                      return (
                        <div key={permission} className="flex items-center gap-2 text-xs">
                          {hasPermission ? (
                            <CheckCircle className="h-3 w-3 text-green-600 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-600 flex-shrink-0" />
                          )}
                          <span className={`${hasPermission ? 'text-green-700' : 'text-red-700'} truncate`}>
                            {permission.replace(/_/g, ' ').toLowerCase()}
                          </span>
                        </div>
                      )
                    })}
                    {compact && permissions.length > 3 && (
                      <p className="text-xs text-muted-foreground">
                        +{permissions.length - 3} more permissions
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Feature Access & Capabilities */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Access & Capabilities</CardTitle>
          <CardDescription>
            Available features and operational capabilities based on current role
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Role-based Feature Access */}
          <div>
            <h4 className="font-semibold mb-3">Role-Based Features</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ManufacturingRoleGuard 
                allowedRoles={[ManufacturingRole.OPS_DISTILLERY_OPERATOR, ManufacturingRole.OPS_DISTILLERY_SHIFTLEAD]}
                showFallback={true}
              >
                <div className="p-3 border border-blue-300 bg-blue-50 rounded-lg">
                  <Factory className="h-5 w-5 text-blue-600 mb-2" />
                  <h5 className="font-semibold text-blue-800 text-sm">Production Monitoring</h5>
                  <p className="text-xs text-blue-700">Real-time production oversight</p>
                </div>
              </ManufacturingRoleGuard>

              <ManufacturingRoleGuard 
                allowedRoles={[ManufacturingRole.ET_ADMIN, ManufacturingRole.ET_CONTROLS]}
                showFallback={true}
              >
                <div className="p-3 border border-green-300 bg-green-50 rounded-lg">
                  <Settings className="h-5 w-5 text-green-600 mb-2" />
                  <h5 className="font-semibold text-green-800 text-sm">System Configuration</h5>
                  <p className="text-xs text-green-700">Engineering & Technology controls</p>
                </div>
              </ManufacturingRoleGuard>

              <ManufacturingRoleGuard 
                allowedRoles={[ManufacturingRole.OPS_DISTILLERY_LEADERSHIP]}
                showFallback={true}
              >
                <div className="p-3 border border-purple-300 bg-purple-50 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-purple-600 mb-2" />
                  <h5 className="font-semibold text-purple-800 text-sm">Analytics Dashboard</h5>
                  <p className="text-xs text-purple-700">Advanced reporting and insights</p>
                </div>
              </ManufacturingRoleGuard>
            </div>
          </div>

          {/* Permission-based Actions */}
          <div>
            <h4 className="font-semibold mb-3">Available Actions</h4>
            <div className="flex flex-wrap gap-3">
              <PermissionButton
                requiredPermissions={[ManufacturingPermission.VIEW_PRODUCTION]}
                fallbackText="View Only"
                size="sm"
              >
                <Eye className="h-3 w-3 mr-1" />
                View Production
              </PermissionButton>

              <PermissionButton
                requiredPermissions={[ManufacturingPermission.EDIT_RECIPES]}
                fallbackText="Edit Restricted"
                variant="outline"
                size="sm"
              >
                <Edit className="h-3 w-3 mr-1" />
                Edit Recipes
              </PermissionButton>

              <PermissionButton
                requiredPermissions={[ManufacturingPermission.CREATE_PRODUCTION_ORDER]}
                fallbackText="Create Restricted"
                variant="outline"
                size="sm"
              >
                <Plus className="h-3 w-3 mr-1" />
                Create Orders
              </PermissionButton>

              <PermissionButton
                requiredRoles={[ManufacturingRole.ET_ADMIN]}
                fallbackText="Admin Only"
                variant="destructive"
                size="sm"
              >
                <Shield className="h-3 w-3 mr-1" />
                System Admin
              </PermissionButton>
            </div>
          </div>

          {/* Factory Status and Feature Flags */}
          <div>
            <h4 className="font-semibold mb-3">System Status & Features</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">Factory Status:</span>
                <FactoryStatusIndicator status="operational" showDetails={true} />
              </div>
              
              <ManufacturingFeatureFlag 
                feature="advanced-analytics"
                showFallback={true}
              >
                <div className="p-3 border border-indigo-300 bg-indigo-50 rounded">
                  <p className="text-sm text-indigo-800">
                    ✨ Advanced Analytics feature is enabled for your role
                  </p>
                </div>
              </ManufacturingFeatureFlag>

              <ManufacturingFeatureFlag 
                feature="equipment-control"
                showFallback={true}
              >
                <div className="p-3 border border-cyan-300 bg-cyan-50 rounded">
                  <p className="text-sm text-cyan-800">
                    🎛️ Equipment Control feature is enabled for your role
                  </p>
                </div>
              </ManufacturingFeatureFlag>
            </div>
          </div>

          {/* Role Access Summary */}
          <div>
            <h4 className="font-semibold mb-3">Role Access Summary</h4>
            <div className="space-y-2">
              <RoleAccessIndicator 
                hasAccess={userRoles.includes(ManufacturingRole.OPS_DISTILLERY_LEADERSHIP)}
                roleName="Distillery Leadership"
              />
              <RoleAccessIndicator 
                hasAccess={userRoles.includes(ManufacturingRole.ET_ADMIN)}
                roleName="Engineering & Technology Admin"
              />
              <RoleAccessIndicator 
                hasAccess={userRoles.includes(ManufacturingRole.MAINTENANCE_LEADERSHIP)}
                roleName="Maintenance Leadership"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default UserDetailView 