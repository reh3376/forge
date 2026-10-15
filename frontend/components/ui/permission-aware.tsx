import React, { ReactNode } from 'react'
import { useAuth } from '@/lib/auth-context'
import { ManufacturingRole, ManufacturingPermission } from '@/lib/auth-config'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Shield, 
  Lock, 
  AlertTriangle, 
  EyeOff,
  Factory,
  Settings,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react'

// Base interfaces for permission-aware components
interface PermissionAwareProps {
  children: ReactNode
  fallback?: ReactNode
  showFallback?: boolean
  className?: string
}

interface RoleBasedProps extends PermissionAwareProps {
  allowedRoles: ManufacturingRole[]
  requireAll?: boolean
}

interface PermissionBasedProps extends PermissionAwareProps {
  requiredPermissions: ManufacturingPermission[]
  requireAll?: boolean
}

interface ConditionalProps extends PermissionAwareProps {
  condition: boolean
  reason?: string
}

// Enhanced Role Guard with manufacturing context
export function ManufacturingRoleGuard({ 
  children, 
  allowedRoles, 
  requireAll = false,
  fallback,
  showFallback = true,
  className 
}: RoleBasedProps) {
  const { user, isAuthenticated, hasAnyRole } = useAuth()

  if (!isAuthenticated || !user) {
    return showFallback ? (
      <Alert className={className}>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Authentication required to access this feature
        </AlertDescription>
      </Alert>
    ) : null
  }

  const hasAccess = requireAll 
    ? allowedRoles.every(role => user.roles.includes(role))
    : hasAnyRole(allowedRoles)

  if (!hasAccess) {
    return fallback || (showFallback ? (
      <Alert variant="destructive" className={className}>
        <Lock className="h-4 w-4" />
        <AlertDescription>
          Insufficient role access. Required: {allowedRoles.join(' or ')}
        </AlertDescription>
      </Alert>
    ) : null)
  }

  return <>{children}</>
}

// Enhanced Permission Guard with detailed feedback
export function ManufacturingPermissionGuard({ 
  children, 
  requiredPermissions, 
  requireAll = true,
  fallback,
  showFallback = true,
  className 
}: PermissionBasedProps) {
  const { user, isAuthenticated, validateAccess } = useAuth()

  if (!isAuthenticated || !user) {
    return showFallback ? (
      <Alert className={className}>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Authentication required to access this feature
        </AlertDescription>
      </Alert>
    ) : null
  }

  const accessResult = validateAccess(requiredPermissions, requireAll)

  if (!accessResult.hasAccess) {
    return fallback || (showFallback ? (
      <Alert variant="destructive" className={className}>
        <Lock className="h-4 w-4" />
        <AlertDescription>
          Missing permissions: {accessResult.missingPermissions.join(', ')}
        </AlertDescription>
      </Alert>
    ) : null)
  }

  return <>{children}</>
}

// Conditional wrapper for any boolean condition
export function ConditionalRender({ 
  children, 
  condition, 
  fallback,
  showFallback = false,
  reason,
  className 
}: ConditionalProps) {
  if (condition) {
    return <>{children}</>
  }

  return fallback || (showFallback ? (
    <Alert className={className}>
      <EyeOff className="h-4 w-4" />
      <AlertDescription>
        {reason || 'Feature not available'}
      </AlertDescription>
    </Alert>
  ) : null)
}

// Permission-aware button with role/permission checking
interface PermissionButtonProps {
  children: ReactNode
  requiredRoles?: ManufacturingRole[]
  requiredPermissions?: ManufacturingPermission[]
  requireAll?: boolean
  fallbackText?: string
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  onClick?: () => void
  disabled?: boolean
  className?: string
}

export function PermissionButton({ 
  children, 
  requiredRoles = [],
  requiredPermissions = [],
  requireAll = false,
  fallbackText,
  variant = 'default',
  size = 'default',
  onClick,
  disabled = false,
  className 
}: PermissionButtonProps) {
  const { user, isAuthenticated, hasAnyRole, validateAccess } = useAuth()

  // Check authentication
  if (!isAuthenticated || !user) {
    return (
      <Button 
        variant="outline" 
        size={size}
        disabled 
        className={className}
      >
        <Lock className="h-4 w-4 mr-2" />
        {fallbackText || 'Login Required'}
      </Button>
    )
  }

  // Check roles if specified
  if (requiredRoles.length > 0) {
    const hasRoleAccess = requireAll 
      ? requiredRoles.every(role => user.roles.includes(role))
      : hasAnyRole(requiredRoles)

    if (!hasRoleAccess) {
      return (
        <Button 
          variant="outline" 
          size={size}
          disabled 
          className={className}
        >
          <Shield className="h-4 w-4 mr-2" />
          {fallbackText || 'Insufficient Role'}
        </Button>
      )
    }
  }

  // Check permissions if specified
  if (requiredPermissions.length > 0) {
    const accessResult = validateAccess(requiredPermissions, requireAll)

    if (!accessResult.hasAccess) {
      return (
        <Button 
          variant="outline" 
          size={size}
          disabled 
          className={className}
        >
          <Lock className="h-4 w-4 mr-2" />
          {fallbackText || 'No Permission'}
        </Button>
      )
    }
  }

  return (
    <Button 
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </Button>
  )
}

// Manufacturing-specific feature flag component
interface FeatureFlagProps extends PermissionAwareProps {
  feature: string
  enabled?: boolean
}

export function ManufacturingFeatureFlag({ 
  children, 
  feature,
  enabled = true,
  fallback,
  showFallback = false,
  className 
}: FeatureFlagProps) {
  const { user } = useAuth()

  // In a real implementation, this would check against feature flags from a service
  // For now, we'll use role-based feature enabling
  const isFeatureEnabled = enabled && (
    feature === 'advanced-analytics' ? user?.roles.some(role => 
      [ManufacturingRole.ET_ADMIN, ManufacturingRole.ET_CONTROLS].includes(role)
    ) :
    feature === 'equipment-control' ? user?.roles.some(role => 
      [ManufacturingRole.ET_ADMIN, ManufacturingRole.ET_CONTROLS, ManufacturingRole.ET_DEVELOPER].includes(role)
    ) :
    feature === 'production-scheduling' ? user?.roles.some(role => 
      [ManufacturingRole.OPS_DISTILLERY_LEADERSHIP, ManufacturingRole.OPS_DISTILLERY_SUPERVISOR].includes(role)
    ) :
    true // Default to enabled for unknown features
  )

  if (!isFeatureEnabled) {
    return fallback || (showFallback ? (
      <Alert className={className}>
        <Settings className="h-4 w-4" />
        <AlertDescription>
          Feature &quot;{feature}&quot; is not enabled for your role
        </AlertDescription>
      </Alert>
    ) : null)
  }

  return <>{children}</>
}

// Permission-aware navigation item
interface PermissionNavItemProps {
  children: ReactNode
  requiredRoles?: ManufacturingRole[]
  requiredPermissions?: ManufacturingPermission[]
  icon?: React.ComponentType<{ className?: string }>
  isActive?: boolean
  onClick?: () => void
  className?: string
}

export function PermissionNavItem({ 
  children, 
  requiredRoles = [],
  requiredPermissions = [],
  icon: Icon,
  isActive = false,
  onClick,
  className 
}: PermissionNavItemProps) {
  const { user, isAuthenticated, hasAnyRole, validateAccess } = useAuth()

  // Don't render if not authenticated
  if (!isAuthenticated || !user) {
    return null
  }

  // Check roles if specified
  if (requiredRoles.length > 0 && !hasAnyRole(requiredRoles)) {
    return null
  }

  // Check permissions if specified
  if (requiredPermissions.length > 0) {
    const accessResult = validateAccess(requiredPermissions, false)
    if (!accessResult.hasAccess) {
      return null
    }
  }

  return (
    <Button
      variant={isActive ? "secondary" : "ghost"}
      className={`w-full justify-start text-left ${className}`}
      onClick={onClick}
    >
      {Icon && <Icon className="h-4 w-4 mr-2" />}
      {children}
    </Button>
  )
}

// Factory status indicator with permission-aware details
interface FactoryStatusProps {
  status: 'operational' | 'maintenance' | 'shutdown' | 'emergency'
  showDetails?: boolean
  className?: string
}

export function FactoryStatusIndicator({ 
  status, 
  showDetails = false,
  className 
}: FactoryStatusProps) {
  const { user, hasPermission } = useAuth()

  const statusConfig = {
    operational: {
      color: 'bg-green-500',
      text: 'Operational',
      icon: Factory,
      badge: 'default' as const
    },
    maintenance: {
      color: 'bg-yellow-500',
      text: 'Maintenance',
      icon: Settings,
      badge: 'secondary' as const
    },
    shutdown: {
      color: 'bg-gray-500',
      text: 'Shutdown',
      icon: Clock,
      badge: 'secondary' as const
    },
    emergency: {
      color: 'bg-red-500',
      text: 'Emergency',
      icon: AlertTriangle,
      badge: 'destructive' as const
    }
  }

  const config = statusConfig[status]
  const Icon = config.icon

  const canViewDetails = showDetails && hasPermission(ManufacturingPermission.VIEW_EQUIPMENT)

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className={`w-3 h-3 rounded-full ${config.color}`} />
      <Badge variant={config.badge}>
        <Icon className="h-3 w-3 mr-1" />
        {config.text}
      </Badge>
      {canViewDetails && (
        <ManufacturingPermissionGuard 
          requiredPermissions={[ManufacturingPermission.VIEW_EQUIPMENT]}
          showFallback={false}
        >
          <span className="text-xs text-muted-foreground">
            ({user?.roles[0] || 'No role'})
          </span>
        </ManufacturingPermissionGuard>
      )}
    </div>
  )
}

// Role-based access indicator
export function RoleAccessIndicator({ 
  hasAccess, 
  roleName,
  className 
}: { 
  hasAccess: boolean
  roleName?: string
  className?: string 
}) {
  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {hasAccess ? (
        <CheckCircle className="h-4 w-4 text-green-600" />
      ) : (
        <XCircle className="h-4 w-4 text-red-600" />
      )}
      <span className={`text-sm ${hasAccess ? 'text-green-700' : 'text-red-700'}`}>
        {hasAccess ? 'Authorized' : 'Not Authorized'}
        {roleName && ` (${roleName})`}
      </span>
    </div>
  )
} 