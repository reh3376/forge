'use client'

import React from 'react'
import { useAuth } from '@/lib/auth-context'
import { RBACService } from '@/lib/rbac'
import { UserDetailModal } from './user-detail-modal'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  User, 
  Mail, 
  Building, 
  Clock, 
  Shield
} from 'lucide-react'

interface UserCardProps {
  className?: string
  compact?: boolean
  showDetailButton?: boolean
}

export function UserCard({ 
  className = "", 
  compact = false, 
  showDetailButton = true 
}: UserCardProps) {
  const { user, getEffectivePermissions, getHighestRole } = useAuth()

  if (!user) {
    return (
      <Card className={`${className}`}>
        <CardContent className="flex items-center justify-center p-6">
          <div className="text-center">
            <User className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No user information</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const userRoles = user.roles || []
  const userPermissions = getEffectivePermissions()
  const highestRole = getHighestRole()

  return (
    <Card className={`${className}`}>
      <CardHeader className={compact ? "pb-3" : ""}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{user.name}</CardTitle>
              <CardDescription className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {user.email}
              </CardDescription>
            </div>
          </div>
          {showDetailButton && (
            <UserDetailModal 
              triggerText="Details"
              triggerVariant="outline"
              triggerSize="sm"
            />
          )}
        </div>
      </CardHeader>
      
      {!compact && (
        <CardContent className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {user.department && (
              <div>
                <p className="text-muted-foreground">Department</p>
                <p className="flex items-center gap-1">
                  <Building className="h-3 w-3" />
                  {user.department}
                </p>
              </div>
            )}
            {user.shift && (
              <div>
                <p className="text-muted-foreground">Shift</p>
                <p className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {user.shift}
                </p>
              </div>
            )}
          </div>

          {/* Role Information */}
          <div>
            <p className="text-sm font-medium mb-2">Current Role</p>
            <div className="flex flex-wrap gap-2">
              {userRoles.slice(0, 2).map((role) => {
                const roleInfo = RBACService.getRoleDisplayInfo(role)
                return (
                  <Badge key={role} variant={roleInfo.badge} className="text-xs">
                    {roleInfo.label}
                  </Badge>
                )
              })}
              {userRoles.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{userRoles.length - 2} more
                </Badge>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1">
              <Shield className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Permissions:</span>
              <span className="font-medium">{userPermissions.length}</span>
            </div>
            {highestRole && (
              <div className="text-right">
                <p className="text-muted-foreground">Highest Role</p>
                <p className="font-medium text-xs">
                  {RBACService.getRoleDisplayInfo(highestRole).label}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

export default UserCard 