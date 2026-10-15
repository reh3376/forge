/**
 * Role-Based Access Control (RBAC) Service
 * Provides comprehensive access control for manufacturing operations
 */

import { 
  ManufacturingRole, 
  ManufacturingPermission, 
  rolePermissions 
} from './auth-config'

// Define role hierarchy (higher roles inherit permissions from lower roles)
const ROLE_HIERARCHY = {
  // Engineering & Technology hierarchy
  [ManufacturingRole.ET_ADMIN]: 10,
  [ManufacturingRole.ET_CONTROLS]: 8,
  [ManufacturingRole.ET_DEVELOPER]: 6,
  
  // Operations hierarchy
  [ManufacturingRole.OPS_DISTILLERY_LEADERSHIP]: 9,
  [ManufacturingRole.OPS_DISTILLERY_SUPERVISOR]: 7,
  [ManufacturingRole.OPS_DISTILLERY_SHIFTLEAD]: 5,
  [ManufacturingRole.OPS_DISTILLERY_OPERATOR]: 3,
  
  // Maintenance hierarchy
  [ManufacturingRole.MAINTENANCE_LEADERSHIP]: 8,
  [ManufacturingRole.MAINTENANCE_TECHNICIAN]: 4
}

// Permission categories for better organization
export const PERMISSION_CATEGORIES = {
  PRODUCTION: [
    ManufacturingPermission.VIEW_PRODUCTION,
    ManufacturingPermission.EDIT_PRODUCTION,
    ManufacturingPermission.CREATE_PRODUCTION_ORDER,
    ManufacturingPermission.APPROVE_PRODUCTION_ORDER,
  ],
  RECIPES: [
    ManufacturingPermission.VIEW_RECIPES,
    ManufacturingPermission.EDIT_RECIPES,
    ManufacturingPermission.CREATE_RECIPES,
    ManufacturingPermission.APPROVE_RECIPES,
  ],
  EQUIPMENT: [
    ManufacturingPermission.VIEW_EQUIPMENT,
    ManufacturingPermission.CONTROL_EQUIPMENT,
    ManufacturingPermission.MAINTAIN_EQUIPMENT,
  ],
  SCHEDULING: [
    ManufacturingPermission.VIEW_SCHEDULE,
    ManufacturingPermission.EDIT_SCHEDULE,
  ],
  QUALITY: [
    ManufacturingPermission.VIEW_QUALITY,
    ManufacturingPermission.EDIT_QUALITY,
    ManufacturingPermission.APPROVE_QUALITY,
  ],
  ENGINEERING: [
    ManufacturingPermission.SYSTEM_CONFIGURATION,
    ManufacturingPermission.CONTROLS_ACCESS,
    ManufacturingPermission.DEVELOPER_ACCESS,
  ],
  MAINTENANCE: [
    ManufacturingPermission.MAINTENANCE_SCHEDULE,
    ManufacturingPermission.MAINTENANCE_EXECUTE,
  ],
  ADMINISTRATION: [
    ManufacturingPermission.MANAGE_USERS,
    ManufacturingPermission.SYSTEM_SETTINGS,
    ManufacturingPermission.VIEW_AUDIT_LOGS,
  ],
}

/**
 * RBAC Service Class
 * Provides methods for role and permission checking with hierarchy support
 */
export class RBACService {
  /**
   * Get all permissions for a role, including inherited permissions
   */
  static getEffectivePermissions(role: ManufacturingRole): ManufacturingPermission[] {
    // With numeric hierarchy, we just return the direct permissions
    // Role inheritance is now based on numeric levels rather than explicit role arrays
    return rolePermissions[role] || []
  }

  /**
   * Get all permissions for multiple roles
   */
  static getEffectivePermissionsForRoles(roles: ManufacturingRole[]): ManufacturingPermission[] {
    const allPermissions = roles.flatMap(role => this.getEffectivePermissions(role))
    return [...new Set(allPermissions)]
  }

  /**
   * Check if a role has a specific permission (with hierarchy)
   */
  static roleHasPermission(role: ManufacturingRole, permission: ManufacturingPermission): boolean {
    const effectivePermissions = this.getEffectivePermissions(role)
    return effectivePermissions.includes(permission)
  }

  /**
   * Check if any of the provided roles has a specific permission
   */
  static rolesHavePermission(roles: ManufacturingRole[], permission: ManufacturingPermission): boolean {
    return roles.some(role => this.roleHasPermission(role, permission))
  }

  /**
   * Check if a role has all of the specified permissions
   */
  static roleHasAllPermissions(role: ManufacturingRole, permissions: ManufacturingPermission[]): boolean {
    const effectivePermissions = this.getEffectivePermissions(role)
    return permissions.every(permission => effectivePermissions.includes(permission))
  }

  /**
   * Check if a role has any of the specified permissions
   */
  static roleHasAnyPermission(role: ManufacturingRole, permissions: ManufacturingPermission[]): boolean {
    const effectivePermissions = this.getEffectivePermissions(role)
    return permissions.some(permission => effectivePermissions.includes(permission))
  }

  /**
   * Check if a role is higher in hierarchy than another role
   */
  static isRoleHigherThan(role: ManufacturingRole, targetRole: ManufacturingRole): boolean {
    const roleLevel = ROLE_HIERARCHY[role] || 0
    const targetLevel = ROLE_HIERARCHY[targetRole] || 0
    return roleLevel > targetLevel
  }

  /**
   * Get the highest role from a list of roles
   */
  static getHighestRole(roles: ManufacturingRole[]): ManufacturingRole | null {
    if (roles.length === 0) return null
    
    const roleOrder: ManufacturingRole[] = [
      ManufacturingRole.ET_ADMIN, 
      ManufacturingRole.OPS_DISTILLERY_LEADERSHIP, 
      ManufacturingRole.OPS_DISTILLERY_SUPERVISOR, 
      ManufacturingRole.OPS_DISTILLERY_SHIFTLEAD, 
      ManufacturingRole.OPS_DISTILLERY_OPERATOR,
      ManufacturingRole.MAINTENANCE_LEADERSHIP,
      ManufacturingRole.MAINTENANCE_TECHNICIAN
    ]
    
    for (const role of roleOrder) {
      if (roles.includes(role)) {
        return role
      }
    }
    
    return roles[0] ?? null // Fallback to first role if none match hierarchy, or null if empty
  }

  /**
   * Check if user can access a specific permission category
   */
  static canAccessCategory(roles: ManufacturingRole[], category: keyof typeof PERMISSION_CATEGORIES): boolean {
    const categoryPermissions = PERMISSION_CATEGORIES[category]
    return categoryPermissions.some(permission => 
      this.rolesHavePermission(roles, permission)
    )
  }

  /**
   * Get accessible permission categories for roles
   */
  static getAccessibleCategories(roles: ManufacturingRole[]): (keyof typeof PERMISSION_CATEGORIES)[] {
    return Object.keys(PERMISSION_CATEGORIES).filter(category => 
      this.canAccessCategory(roles, category as keyof typeof PERMISSION_CATEGORIES)
    ) as (keyof typeof PERMISSION_CATEGORIES)[]
  }

  /**
   * Validate if a user can perform an action based on their roles
   */
  static validateAccess(
    userRoles: ManufacturingRole[], 
    requiredPermissions: ManufacturingPermission[],
    requireAll: boolean = false
  ): { hasAccess: boolean; missingPermissions: ManufacturingPermission[] } {
    const userPermissions = this.getEffectivePermissionsForRoles(userRoles)
    
    const missingPermissions = requiredPermissions.filter(
      permission => !userPermissions.includes(permission)
    )
    
    const hasAccess = requireAll 
      ? missingPermissions.length === 0
      : requiredPermissions.some(permission => userPermissions.includes(permission))
    
    return {
      hasAccess,
      missingPermissions
    }
  }

  /**
   * Get role display information
   */
  static getRoleDisplayInfo(role: ManufacturingRole): {
    label: string
    description: string
    level: number
    badge: 'default' | 'secondary' | 'destructive' | 'outline'
  } {
    const roleInfo = {
      [ManufacturingRole.ET_ADMIN]: {
        label: 'ET Administrator',
        description: 'System administrator with full access',
        level: 10,
        badge: 'destructive' as const
      },
      [ManufacturingRole.ET_CONTROLS]: {
        label: 'ET Controls',
        description: 'Process engineer with technical access',
        level: 8,
        badge: 'secondary' as const
      },
      [ManufacturingRole.ET_DEVELOPER]: {
        label: 'ET Developer',
        description: 'Process engineer with technical access',
        level: 6,
        badge: 'secondary' as const
      },
      [ManufacturingRole.OPS_DISTILLERY_LEADERSHIP]: {
        label: 'Distillery Leader',
        description: 'Team supervisor with operational oversight',
        level: 9,
        badge: 'secondary' as const
      },
      [ManufacturingRole.OPS_DISTILLERY_SUPERVISOR]: {
        label: 'Distillery Supervisor',
        description: 'Team supervisor with operational oversight',
        level: 7,
        badge: 'secondary' as const
      },
      [ManufacturingRole.OPS_DISTILLERY_SHIFTLEAD]: {
        label: 'Distillery Shift Lead',
        description: 'Team supervisor with operational oversight',
        level: 5,
        badge: 'secondary' as const
      },
      [ManufacturingRole.OPS_DISTILLERY_OPERATOR]: {
        label: 'Distillery Operator',
        description: 'Production line operator with basic access',
        level: 3,
        badge: 'outline' as const
      },
      [ManufacturingRole.MAINTENANCE_LEADERSHIP]: {
        label: 'Maintenance Leader',
        description: 'Team supervisor with operational oversight',
        level: 8,
        badge: 'secondary' as const
      },
      [ManufacturingRole.MAINTENANCE_TECHNICIAN]: {
        label: 'Maintenance Technician',
        description: 'Process engineer with technical access',
        level: 4,
        badge: 'secondary' as const
      }
    }
    
    return roleInfo[role]
  }

  /**
   * Check if user can manage another user based on role hierarchy
   */
  static canManageUser(managerRoles: ManufacturingRole[], targetUserRoles: ManufacturingRole[]): boolean {
    const managerHighestRole = this.getHighestRole(managerRoles)
    const targetHighestRole = this.getHighestRole(targetUserRoles)
    
    if (!managerHighestRole || !targetHighestRole) return false
    
    return this.isRoleHigherThan(managerHighestRole, targetHighestRole) || 
           managerRoles.includes(ManufacturingRole.ET_ADMIN)
  }
}

/**
 * Permission checking utilities for common operations
 */
export const PermissionUtils = {
  // Production operations
  canViewProduction: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.VIEW_PRODUCTION),
  
  canEditProduction: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.EDIT_PRODUCTION),
  
  canCreateProductionOrder: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.CREATE_PRODUCTION_ORDER),
  
  canApproveProductionOrder: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.APPROVE_PRODUCTION_ORDER),
  
  // Recipe operations
  canViewRecipes: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.VIEW_RECIPES),
  
  canEditRecipes: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.EDIT_RECIPES),
  
  canCreateRecipes: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.CREATE_RECIPES),
  
  canApproveRecipes: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.APPROVE_RECIPES),
  
  // Equipment operations
  canViewEquipment: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.VIEW_EQUIPMENT),
  
  canControlEquipment: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.CONTROL_EQUIPMENT),
  
  canMaintainEquipment: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.MAINTAIN_EQUIPMENT),
  
  // Quality operations
  canViewQuality: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.VIEW_QUALITY),
  
  canEditQuality: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.EDIT_QUALITY),
  
  canApproveQuality: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.APPROVE_QUALITY),
  
  // Scheduling operations
  canViewSchedule: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.VIEW_SCHEDULE),
  
  canEditSchedule: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.EDIT_SCHEDULE),

  // Advanced scheduling operations (for leadership and engineering roles)
  canManageScheduleQueue: (roles: ManufacturingRole[]) => 
    roles.some(role => [
      ManufacturingRole.OPS_DISTILLERY_LEADERSHIP,
      ManufacturingRole.OPS_DISTILLERY_SUPERVISOR,
      ManufacturingRole.ET_ADMIN,
      ManufacturingRole.ET_CONTROLS
    ].includes(role)),

  canCreateProductionOrders: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.CREATE_PRODUCTION_ORDER),

  canApproveScheduleChanges: (roles: ManufacturingRole[]) => 
    roles.some(role => [
      ManufacturingRole.OPS_DISTILLERY_LEADERSHIP,
      ManufacturingRole.ET_ADMIN
    ].includes(role)),
  
  // Administrative operations
  canManageUsers: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.MANAGE_USERS),
  
  canAccessSystemSettings: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.SYSTEM_SETTINGS),
  
  canViewAuditLogs: (roles: ManufacturingRole[]) => 
    RBACService.rolesHavePermission(roles, ManufacturingPermission.VIEW_AUDIT_LOGS)
}

/**
 * Route-based access control configuration
 */
export const ROUTE_ACCESS_CONTROL = {
  '/dashboard': [ManufacturingRole.OPS_DISTILLERY_OPERATOR], // All roles can access dashboard
  '/scheduling': [
    ManufacturingRole.OPS_DISTILLERY_LEADERSHIP,
    ManufacturingRole.OPS_DISTILLERY_SUPERVISOR,
    ManufacturingRole.OPS_DISTILLERY_SHIFTLEAD,
    ManufacturingRole.ET_ADMIN,
    ManufacturingRole.ET_CONTROLS
  ],
  '/recipe-management': [
    ManufacturingRole.ET_ADMIN,
    ManufacturingRole.ET_CONTROLS,
    ManufacturingRole.ET_DEVELOPER,
    ManufacturingRole.OPS_DISTILLERY_LEADERSHIP,
    ManufacturingRole.OPS_DISTILLERY_SUPERVISOR
  ],
  '/line-overview': [ManufacturingRole.OPS_DISTILLERY_OPERATOR],
  '/configuration': [ManufacturingRole.ET_CONTROLS],
  '/admin': [ManufacturingRole.ET_ADMIN, ManufacturingRole.OPS_DISTILLERY_LEADERSHIP],
  '/maintenance': [ManufacturingRole.MAINTENANCE_TECHNICIAN],
  '/developer': [ManufacturingRole.ET_DEVELOPER]
}

/**
 * Scheduling-specific role mapping and access levels
 */
export const SCHEDULING_ACCESS_LEVELS = {
  // Full administrative access - can approve, create, modify, and delete
  ADMIN: [
    ManufacturingRole.ET_ADMIN,
    ManufacturingRole.OPS_DISTILLERY_LEADERSHIP
  ],
  
  // Management access - can create, modify, and manage queue
  MANAGEMENT: [
    ManufacturingRole.OPS_DISTILLERY_SUPERVISOR,
    ManufacturingRole.ET_CONTROLS
  ],
  
  // Operational access - can view and make basic modifications
  OPERATIONAL: [
    ManufacturingRole.OPS_DISTILLERY_SHIFTLEAD
  ],
  
  // Read-only access - can view schedules but not modify
  READONLY: [
    ManufacturingRole.OPS_DISTILLERY_OPERATOR,
    ManufacturingRole.ET_DEVELOPER,
    ManufacturingRole.MAINTENANCE_TECHNICIAN
  ]
} as const

/**
 * Scheduling permission checker utility
 */
export const SchedulingPermissions = {
  canViewSchedule: (roles: ManufacturingRole[]): boolean => {
    return Object.values(SCHEDULING_ACCESS_LEVELS).flat().some(role => roles.includes(role))
  },
  
  canEditSchedule: (roles: ManufacturingRole[]): boolean => {
    return [
      ...SCHEDULING_ACCESS_LEVELS.ADMIN,
      ...SCHEDULING_ACCESS_LEVELS.MANAGEMENT,
      ...SCHEDULING_ACCESS_LEVELS.OPERATIONAL
    ].some(role => roles.includes(role))
  },
  
  canManageQueue: (roles: ManufacturingRole[]): boolean => {
    return [
      ...SCHEDULING_ACCESS_LEVELS.ADMIN,
      ...SCHEDULING_ACCESS_LEVELS.MANAGEMENT
    ].some(role => roles.includes(role))
  },
  
  canCreateOrders: (roles: ManufacturingRole[]): boolean => {
    return [
      ...SCHEDULING_ACCESS_LEVELS.ADMIN,
      ...SCHEDULING_ACCESS_LEVELS.MANAGEMENT
    ].some(role => roles.includes(role))
  },
  
  canApproveChanges: (roles: ManufacturingRole[]): boolean => {
    return SCHEDULING_ACCESS_LEVELS.ADMIN.some(role => roles.includes(role))
  },
  
  getAccessLevel: (roles: ManufacturingRole[]): 'admin' | 'management' | 'operational' | 'readonly' | 'none' => {
    if (SCHEDULING_ACCESS_LEVELS.ADMIN.some(role => roles.includes(role))) {
      return 'admin'
    }
    if (SCHEDULING_ACCESS_LEVELS.MANAGEMENT.some(role => roles.includes(role))) {
      return 'management'
    }
    if (SCHEDULING_ACCESS_LEVELS.OPERATIONAL.some(role => roles.includes(role))) {
      return 'operational'
    }
    if (SCHEDULING_ACCESS_LEVELS.READONLY.some(role => roles.includes(role))) {
      return 'readonly'
    }
    return 'none'
  }
} as const

export default RBACService 