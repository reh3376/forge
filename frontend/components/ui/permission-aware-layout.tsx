import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { ManufacturingRole, ManufacturingPermission } from '@/lib/auth-config'
import { 
  PermissionNavItem, 
  ManufacturingRoleGuard, 
  ManufacturingPermissionGuard,
  FactoryStatusIndicator 
} from '@/components/ui/permission-aware'
import { Header } from '@/components/ui/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/ui/equipment-status'
import { 
  Home, 
  Calendar, 
  Settings, 
  ChefHat, 
  BarChart3, 
  ChevronLeft,
  ChevronRight,
  Shield,
  Users,
  ClipboardList,
  Cog,
  Activity
} from 'lucide-react'

// Permission-based navigation configuration
const permissionBasedNavigation = [
  {
    title: 'HOME',
    icon: Home,
    href: '/',
    color: 'text-blue-600',
    requiredRoles: [], // Available to all authenticated users
    requiredPermissions: []
  },
  {
    title: 'SCHEDULING',
    icon: Calendar,
    href: '/scheduling',
    color: 'text-green-600',
    requiredRoles: [
      ManufacturingRole.OPS_DISTILLERY_LEADERSHIP, 
      ManufacturingRole.OPS_DISTILLERY_SUPERVISOR,
      ManufacturingRole.OPS_DISTILLERY_SHIFTLEAD
    ],
    requiredPermissions: [ManufacturingPermission.VIEW_PRODUCTION]
  },
  {
    title: 'LINE OVERVIEW',
    icon: BarChart3,
    href: '/dashboard/line-overview',
    color: 'text-purple-600',
    requiredRoles: [
      ManufacturingRole.OPS_DISTILLERY_LEADERSHIP,
      ManufacturingRole.OPS_DISTILLERY_SUPERVISOR,
      ManufacturingRole.ET_ADMIN,
      ManufacturingRole.ET_CONTROLS
    ],
    requiredPermissions: [ManufacturingPermission.VIEW_PRODUCTION]
  },
  {
    title: 'RECIPE MANAGEMENT',
    icon: ChefHat,
    href: '/recipe-management',
    color: 'text-orange-600',
    requiredRoles: [
      ManufacturingRole.ET_ADMIN,
      ManufacturingRole.ET_CONTROLS,
      ManufacturingRole.ET_DEVELOPER,
      ManufacturingRole.OPS_DISTILLERY_LEADERSHIP,
      ManufacturingRole.OPS_DISTILLERY_SUPERVISOR
    ],
    requiredPermissions: [ManufacturingPermission.VIEW_RECIPES]
  },
  {
    title: 'CONFIGURATION',
    icon: Settings,
    href: '/configuration',
    color: 'text-gray-600',
    requiredRoles: [
      ManufacturingRole.ET_ADMIN,
      ManufacturingRole.ET_CONTROLS
    ],
    requiredPermissions: [ManufacturingPermission.SYSTEM_SETTINGS]
  },
  {
    title: 'MAINTENANCE',
    icon: Cog,
    href: '/maintenance',
    color: 'text-red-600',
    requiredRoles: [
      ManufacturingRole.MAINTENANCE_LEADERSHIP,
      ManufacturingRole.MAINTENANCE_TECHNICIAN
    ],
    requiredPermissions: [ManufacturingPermission.VIEW_EQUIPMENT]
  },
  {
    title: 'USER MANAGEMENT',
    icon: Users,
    href: '/admin/users',
    color: 'text-indigo-600',
    requiredRoles: [ManufacturingRole.ET_ADMIN],
    requiredPermissions: [ManufacturingPermission.MANAGE_USERS]
  },
  {
    title: 'AUDIT LOGS',
    icon: ClipboardList,
    href: '/admin/audit',
    color: 'text-pink-600',
    requiredRoles: [
      ManufacturingRole.ET_ADMIN,
      ManufacturingRole.OPS_DISTILLERY_LEADERSHIP
    ],
    requiredPermissions: [ManufacturingPermission.VIEW_AUDIT_LOGS]
  }
]

// Equipment status with permission-based visibility
const equipmentStatusItems = [
  {
    name: 'Mashing01',
    status: 'running' as const,
    requiredPermissions: [ManufacturingPermission.VIEW_EQUIPMENT]
  },
  {
    name: 'Fermentation01',
    status: 'idle' as const,
    requiredPermissions: [ManufacturingPermission.VIEW_EQUIPMENT]
  },
  {
    name: 'Distillation01',
    status: 'maintenance' as const,
    requiredPermissions: [ManufacturingPermission.VIEW_EQUIPMENT]
  },
  {
    name: 'CIP System',
    status: 'offline' as const,
    requiredPermissions: [ManufacturingPermission.CONTROL_EQUIPMENT]
  }
]

// Permission-aware sidebar component
interface PermissionAwareSidebarProps {
  className?: string
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

export function PermissionAwareSidebar({ 
  className, 
  collapsed = false, 
  onCollapsedChange 
}: PermissionAwareSidebarProps) {
  const [currentPath, setCurrentPath] = useState('/')
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return (
      <aside className={cn(
        'flex flex-col border-r bg-card/50 backdrop-blur transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
        className
      )}>
        <div className="flex items-center justify-center p-4">
          <Badge variant="outline">
            <Shield className="h-3 w-3 mr-1" />
            Not Authenticated
          </Badge>
        </div>
      </aside>
    )
  }

  return (
    <aside className={cn(
      'flex flex-col border-r bg-card/50 backdrop-blur transition-all duration-300',
      collapsed ? 'w-16' : 'w-64',
      className
    )}>
      {/* Collapse Toggle */}
      <div className="flex items-center justify-end p-2 border-b">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => onCollapsedChange?.(!collapsed)}
          className="h-8 w-8 p-0"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* User Role Display */}
      {!collapsed && (
        <div className="p-3 border-b">
          <div className="text-xs text-muted-foreground mb-1">Current Role</div>
          <Badge variant="secondary" className="text-xs">
            {user.roles[0] || 'No Role'}
          </Badge>
        </div>
      )}

      {/* Permission-based Navigation Items */}
      <nav className="flex-1 p-2 space-y-1">
        {permissionBasedNavigation.map((item) => {
          const Icon = item.icon
          const isActive = currentPath === item.href
          
          return (
            <PermissionNavItem
              key={item.href}
              requiredRoles={item.requiredRoles}
              requiredPermissions={item.requiredPermissions}
              icon={Icon}
              isActive={isActive}
              onClick={() => setCurrentPath(item.href)}
              className={collapsed ? "px-2" : "px-3"}
            >
              {!collapsed && <span className="text-sm">{item.title}</span>}
            </PermissionNavItem>
          )
        })}
      </nav>

      {/* Equipment Status - Permission-based */}
      <ManufacturingPermissionGuard 
        requiredPermissions={[ManufacturingPermission.VIEW_EQUIPMENT]}
        showFallback={false}
      >
        {!collapsed && (
          <div className="p-3 border-t">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              Equipment Status
            </h4>
            <div className="space-y-2">
              {equipmentStatusItems.map((equipment) => (
                <ManufacturingPermissionGuard
                  key={equipment.name}
                  requiredPermissions={equipment.requiredPermissions}
                  showFallback={false}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{equipment.name}</span>
                    <StatusDot status={equipment.status} />
                  </div>
                </ManufacturingPermissionGuard>
              ))}
            </div>
          </div>
        )}
      </ManufacturingPermissionGuard>

      {/* Factory Status - Role-based visibility */}
      <ManufacturingRoleGuard
        allowedRoles={[
          ManufacturingRole.OPS_DISTILLERY_LEADERSHIP,
          ManufacturingRole.OPS_DISTILLERY_SUPERVISOR,
          ManufacturingRole.ET_ADMIN
        ]}
        showFallback={false}
      >
        {!collapsed && (
          <div className="p-3 border-t">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              Factory Status
            </h4>
            <FactoryStatusIndicator 
              status="operational" 
              showDetails={true}
              className="text-sm"
            />
          </div>
        )}
      </ManufacturingRoleGuard>
    </aside>
  )
}

// Permission-aware page container
interface PermissionAwarePageContainerProps {
  children: React.ReactNode
  className?: string
  showSidebar?: boolean
  showHeader?: boolean
  requiredRoles?: ManufacturingRole[]
  requiredPermissions?: ManufacturingPermission[]
}

export function PermissionAwarePageContainer({ 
  children, 
  className, 
  showSidebar = true, 
  showHeader = true,
  requiredRoles = [],
  requiredPermissions = []
}: PermissionAwarePageContainerProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // If specific roles or permissions are required, wrap in guards
  if (requiredRoles.length > 0 || requiredPermissions.length > 0) {
    const content = (
      <div className={cn('min-h-screen bg-background flex flex-col', className)}>
              {showHeader && (
        <Header />
      )}
        
        <div className="flex flex-1">
          {showSidebar && (
            <PermissionAwareSidebar 
              collapsed={sidebarCollapsed}
              onCollapsedChange={setSidebarCollapsed}
            />
          )}
          <main className="flex-1 p-6">
            {children}
          </main>
        </div>
      </div>
    )

    if (requiredRoles.length > 0) {
      return (
        <ManufacturingRoleGuard allowedRoles={requiredRoles}>
          {requiredPermissions.length > 0 ? (
            <ManufacturingPermissionGuard requiredPermissions={requiredPermissions}>
              {content}
            </ManufacturingPermissionGuard>
          ) : content}
        </ManufacturingRoleGuard>
      )
    }

    if (requiredPermissions.length > 0) {
      return (
        <ManufacturingPermissionGuard requiredPermissions={requiredPermissions}>
          {content}
        </ManufacturingPermissionGuard>
      )
    }
  }

  // Default page container without permission requirements
  return (
    <div className={cn('min-h-screen bg-background flex flex-col', className)}>
      {showHeader && (
        <Header />
      )}
      
      <div className="flex flex-1">
        {showSidebar && (
          <PermissionAwareSidebar 
            collapsed={sidebarCollapsed}
            onCollapsedChange={setSidebarCollapsed}
          />
        )}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

// Permission-aware dashboard widgets
export function PermissionAwareDashboardGrid({ 
  children, 
  className 
}: { 
  children: React.ReactNode
  className?: string 
}) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6', className)}>
      {/* Production Overview - Available to operators and above */}
      <ManufacturingRoleGuard
        allowedRoles={[
          ManufacturingRole.OPS_DISTILLERY_OPERATOR,
          ManufacturingRole.OPS_DISTILLERY_SHIFTLEAD,
          ManufacturingRole.OPS_DISTILLERY_SUPERVISOR,
          ManufacturingRole.OPS_DISTILLERY_LEADERSHIP
        ]}
        showFallback={false}
      >
        <div className="bg-card p-4 rounded-lg border">
          <h3 className="font-semibold mb-2 flex items-center">
            <Activity className="h-4 w-4 mr-2" />
            Production Overview
          </h3>
          <p className="text-sm text-muted-foreground">
            Current production status and metrics
          </p>
        </div>
      </ManufacturingRoleGuard>

      {/* Equipment Control - Engineering and Maintenance only */}
      <ManufacturingRoleGuard
        allowedRoles={[
          ManufacturingRole.ET_ADMIN,
          ManufacturingRole.ET_CONTROLS,
          ManufacturingRole.MAINTENANCE_LEADERSHIP,
          ManufacturingRole.MAINTENANCE_TECHNICIAN
        ]}
        showFallback={false}
      >
        <div className="bg-card p-4 rounded-lg border">
          <h3 className="font-semibold mb-2 flex items-center">
            <Cog className="h-4 w-4 mr-2" />
            Equipment Control
          </h3>
          <p className="text-sm text-muted-foreground">
            Monitor and control manufacturing equipment
          </p>
        </div>
      </ManufacturingRoleGuard>

      {/* System Administration - Admin only */}
      <ManufacturingRoleGuard
        allowedRoles={[ManufacturingRole.ET_ADMIN]}
        showFallback={false}
      >
        <div className="bg-card p-4 rounded-lg border">
          <h3 className="font-semibold mb-2 flex items-center">
            <Shield className="h-4 w-4 mr-2" />
            System Administration
          </h3>
          <p className="text-sm text-muted-foreground">
            Manage users, roles, and system settings
          </p>
        </div>
      </ManufacturingRoleGuard>

      {children}
    </div>
  )
} 