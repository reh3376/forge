import { Injectable } from "@nestjs/common";

interface Permission {
  resource: string;
  action: string;
  attributes: string;
}

interface OptimizedGrants {
  roleHierarchy: Record<string, string[]>;
  basePermissions: Record<string, Permission[]>;
  uniquePermissions: Record<string, Permission[]>;
}

@Injectable()
export class OptimizedPermissionService {
  private grants: OptimizedGrants;

  constructor() {
    // Load the optimized grants
    this.grants = require("../optimized-grants-fixed.json");
  }

  /**
   * Get all permissions for a role, including inherited and unique permissions
   */
  getPermissionsForRole(role: string): Permission[] {
    const baseRole = this.findBaseRole(role);
    const basePermissions = this.grants.basePermissions[baseRole] || [];
    const uniquePermissions = this.grants.uniquePermissions[role] || [];

    return [...basePermissions, ...uniquePermissions];
  }

  /**
   * Check if a role has a specific permission
   */
  hasPermission(
    role: string,
    resource: string,
    action: string,
    attributes: string = "*"
  ): boolean {
    const permissions = this.getPermissionsForRole(role);
    return permissions.some(
      (p) =>
        p.resource === resource &&
        p.action === action &&
        p.attributes === attributes
    );
  }

  /**
   * Find the base role for a given role (handles inheritance)
   */
  private findBaseRole(role: string): string {
    // Check if this role is a base role
    if (this.grants.basePermissions[role]) {
      return role;
    }

    // Find which base role this role inherits from
    for (const [baseRole, inheritingRoles] of Object.entries(
      this.grants.roleHierarchy
    )) {
      if (inheritingRoles.includes(role)) {
        return baseRole;
      }
    }

    throw new Error(`Unknown role: ${role}`);
  }

  /**
   * Get all roles that inherit from a base role
   */
  getInheritingRoles(baseRole: string): string[] {
    return this.grants.roleHierarchy[baseRole] || [];
  }

  /**
   * Get all available roles
   */
  getAllRoles(): string[] {
    const baseRoles = Object.keys(this.grants.basePermissions);
    const inheritingRoles = Object.values(this.grants.roleHierarchy).flat();
    return [...baseRoles, ...inheritingRoles];
  }

  /**
   * Get unique permissions for a specific role
   */
  getUniquePermissions(role: string): Permission[] {
    return this.grants.uniquePermissions[role] || [];
  }
}
