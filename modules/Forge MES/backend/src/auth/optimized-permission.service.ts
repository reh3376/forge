import { Injectable } from "@nestjs/common";

interface Permission {
  resource: string;
  action: string;
  attributes: string;
}

interface OptimizedGrants {
  basePermissions: Record<string, Permission[]>;
  roleInheritance: Record<string, string>;
  uniquePermissions: Record<string, Permission[]>;
}

@Injectable()
export class OptimizedPermissionService {
  private optimizedGrants: OptimizedGrants;

  constructor() {
    // Load the optimized grants structure
    this.optimizedGrants = {
      basePermissions: {
        admin: [
          { resource: "AdditiveActual", action: "create:any", attributes: "*" },
          { resource: "AdditiveActual", action: "read:any", attributes: "*" },
          { resource: "AdditiveActual", action: "update:any", attributes: "*" },
          { resource: "AdditiveActual", action: "delete:any", attributes: "*" },
          { resource: "Asset", action: "create:any", attributes: "*" },
          { resource: "Asset", action: "read:any", attributes: "*" },
          { resource: "Asset", action: "update:any", attributes: "*" },
          { resource: "Asset", action: "delete:any", attributes: "*" },
          { resource: "AuditLog", action: "read:any", attributes: "*" },
          { resource: "Batch", action: "create:any", attributes: "*" },
          { resource: "Batch", action: "read:any", attributes: "*" },
          { resource: "Batch", action: "update:any", attributes: "*" },
          { resource: "Batch", action: "delete:any", attributes: "*" },
          { resource: "Bom", action: "create:any", attributes: "*" },
          { resource: "Bom", action: "read:any", attributes: "*" },
          { resource: "Bom", action: "update:any", attributes: "*" },
          { resource: "Bom", action: "delete:any", attributes: "*" },
          { resource: "BomItem", action: "create:any", attributes: "*" },
          { resource: "BomItem", action: "read:any", attributes: "*" },
          { resource: "BomItem", action: "update:any", attributes: "*" },
          { resource: "BomItem", action: "delete:any", attributes: "*" },
          { resource: "Comment", action: "create:any", attributes: "*" },
          { resource: "Comment", action: "read:any", attributes: "*" },
          { resource: "Comment", action: "update:any", attributes: "*" },
          { resource: "Comment", action: "delete:any", attributes: "*" },
          { resource: "Customer", action: "create:any", attributes: "*" },
          { resource: "Customer", action: "read:any", attributes: "*" },
          { resource: "Customer", action: "update:any", attributes: "*" },
          { resource: "Customer", action: "delete:any", attributes: "*" },
          { resource: "EquipmentPhase", action: "create:any", attributes: "*" },
          { resource: "EquipmentPhase", action: "read:any", attributes: "*" },
          { resource: "EquipmentPhase", action: "update:any", attributes: "*" },
          { resource: "EquipmentPhase", action: "delete:any", attributes: "*" },
          { resource: "FormulaLibrary", action: "create:any", attributes: "*" },
          { resource: "FormulaLibrary", action: "read:any", attributes: "*" },
          { resource: "FormulaLibrary", action: "update:any", attributes: "*" },
          { resource: "FormulaLibrary", action: "delete:any", attributes: "*" },
          { resource: "Instruction", action: "create:any", attributes: "*" },
          { resource: "Instruction", action: "read:any", attributes: "*" },
          { resource: "Instruction", action: "update:any", attributes: "*" },
          { resource: "Instruction", action: "delete:any", attributes: "*" },
          { resource: "Inventory", action: "create:any", attributes: "*" },
          { resource: "Inventory", action: "read:any", attributes: "*" },
          { resource: "Inventory", action: "update:any", attributes: "*" },
          { resource: "Inventory", action: "delete:any", attributes: "*" },
          { resource: "InventoryLog", action: "create:any", attributes: "*" },
          { resource: "InventoryLog", action: "read:any", attributes: "*" },
          { resource: "InventoryLog", action: "update:any", attributes: "*" },
          { resource: "InventoryLog", action: "delete:any", attributes: "*" },
          {
            resource: "InventoryTransfer",
            action: "create:any",
            attributes: "*",
          },
          {
            resource: "InventoryTransfer",
            action: "read:any",
            attributes: "*",
          },
          {
            resource: "InventoryTransfer",
            action: "update:any",
            attributes: "*",
          },
          {
            resource: "InventoryTransfer",
            action: "delete:any",
            attributes: "*",
          },
          { resource: "Item", action: "create:any", attributes: "*" },
          { resource: "Item", action: "read:any", attributes: "*" },
          { resource: "Item", action: "update:any", attributes: "*" },
          { resource: "Item", action: "delete:any", attributes: "*" },
          { resource: "ItemGroup", action: "create:any", attributes: "*" },
          { resource: "ItemGroup", action: "read:any", attributes: "*" },
          { resource: "ItemGroup", action: "update:any", attributes: "*" },
          { resource: "ItemGroup", action: "delete:any", attributes: "*" },
          { resource: "ItemReceipt", action: "create:any", attributes: "*" },
          { resource: "ItemReceipt", action: "read:any", attributes: "*" },
          { resource: "ItemReceipt", action: "update:any", attributes: "*" },
          { resource: "ItemReceipt", action: "delete:any", attributes: "*" },
          { resource: "Lot", action: "create:any", attributes: "*" },
          { resource: "Lot", action: "read:any", attributes: "*" },
          { resource: "Lot", action: "update:any", attributes: "*" },
          { resource: "Lot", action: "delete:any", attributes: "*" },
          {
            resource: "MashingProtocol",
            action: "create:any",
            attributes: "*",
          },
          { resource: "MashingProtocol", action: "read:any", attributes: "*" },
          {
            resource: "MashingProtocol",
            action: "update:any",
            attributes: "*",
          },
          {
            resource: "MashingProtocol",
            action: "delete:any",
            attributes: "*",
          },
          {
            resource: "MashingProtocolStep",
            action: "create:any",
            attributes: "*",
          },
          {
            resource: "MashingProtocolStep",
            action: "read:any",
            attributes: "*",
          },
          {
            resource: "MashingProtocolStep",
            action: "update:any",
            attributes: "*",
          },
          {
            resource: "MashingProtocolStep",
            action: "delete:any",
            attributes: "*",
          },
          {
            resource: "MashingProtocolStepActual",
            action: "create:any",
            attributes: "*",
          },
          {
            resource: "MashingProtocolStepActual",
            action: "read:any",
            attributes: "*",
          },
          {
            resource: "MashingProtocolStepActual",
            action: "update:any",
            attributes: "*",
          },
          {
            resource: "MashingProtocolStepActual",
            action: "delete:any",
            attributes: "*",
          },
          {
            resource: "MillingBinConfiguration",
            action: "create:any",
            attributes: "*",
          },
          {
            resource: "MillingBinConfiguration",
            action: "read:any",
            attributes: "*",
          },
          {
            resource: "MillingBinConfiguration",
            action: "update:any",
            attributes: "*",
          },
          {
            resource: "MillingBinConfiguration",
            action: "delete:any",
            attributes: "*",
          },
          { resource: "Notification", action: "create:any", attributes: "*" },
          { resource: "Notification", action: "read:any", attributes: "*" },
          { resource: "Notification", action: "update:any", attributes: "*" },
          { resource: "Notification", action: "delete:any", attributes: "*" },
          { resource: "Operation", action: "create:any", attributes: "*" },
          { resource: "Operation", action: "read:any", attributes: "*" },
          { resource: "Operation", action: "update:any", attributes: "*" },
          { resource: "Operation", action: "delete:any", attributes: "*" },
          { resource: "PhaseParameter", action: "create:any", attributes: "*" },
          { resource: "PhaseParameter", action: "read:any", attributes: "*" },
          { resource: "PhaseParameter", action: "update:any", attributes: "*" },
          { resource: "PhaseParameter", action: "delete:any", attributes: "*" },
          { resource: "Procedure", action: "create:any", attributes: "*" },
          { resource: "Procedure", action: "read:any", attributes: "*" },
          { resource: "Procedure", action: "update:any", attributes: "*" },
          { resource: "Procedure", action: "delete:any", attributes: "*" },
          {
            resource: "ProductionOrder",
            action: "create:any",
            attributes: "*",
          },
          { resource: "ProductionOrder", action: "read:any", attributes: "*" },
          {
            resource: "ProductionOrder",
            action: "update:any",
            attributes: "*",
          },
          {
            resource: "ProductionOrder",
            action: "delete:any",
            attributes: "*",
          },
          {
            resource: "ProductionOrderBomItem",
            action: "create:any",
            attributes: "*",
          },
          {
            resource: "ProductionOrderBomItem",
            action: "read:any",
            attributes: "*",
          },
          {
            resource: "ProductionOrderBomItem",
            action: "update:any",
            attributes: "*",
          },
          {
            resource: "ProductionOrderBomItem",
            action: "delete:any",
            attributes: "*",
          },
          {
            resource: "ProductionOrderRecipeInstance",
            action: "create:any",
            attributes: "*",
          },
          {
            resource: "ProductionOrderRecipeInstance",
            action: "read:any",
            attributes: "*",
          },
          {
            resource: "ProductionOrderRecipeInstance",
            action: "update:any",
            attributes: "*",
          },
          {
            resource: "ProductionOrderRecipeInstance",
            action: "delete:any",
            attributes: "*",
          },
          { resource: "PurchaseOrder", action: "create:any", attributes: "*" },
          { resource: "PurchaseOrder", action: "read:any", attributes: "*" },
          { resource: "PurchaseOrder", action: "update:any", attributes: "*" },
          { resource: "PurchaseOrder", action: "delete:any", attributes: "*" },
          { resource: "Recipe", action: "create:any", attributes: "*" },
          { resource: "Recipe", action: "read:any", attributes: "*" },
          { resource: "Recipe", action: "update:any", attributes: "*" },
          { resource: "Recipe", action: "delete:any", attributes: "*" },
          { resource: "RecipeBom", action: "create:any", attributes: "*" },
          { resource: "RecipeBom", action: "read:any", attributes: "*" },
          { resource: "RecipeBom", action: "update:any", attributes: "*" },
          { resource: "RecipeBom", action: "delete:any", attributes: "*" },
          {
            resource: "RecipeBomActual",
            action: "create:any",
            attributes: "*",
          },
          { resource: "RecipeBomActual", action: "read:any", attributes: "*" },
          {
            resource: "RecipeBomActual",
            action: "update:any",
            attributes: "*",
          },
          {
            resource: "RecipeBomActual",
            action: "delete:any",
            attributes: "*",
          },
          { resource: "RecipeBomItem", action: "create:any", attributes: "*" },
          { resource: "RecipeBomItem", action: "read:any", attributes: "*" },
          { resource: "RecipeBomItem", action: "update:any", attributes: "*" },
          { resource: "RecipeBomItem", action: "delete:any", attributes: "*" },
          { resource: "RecipeGroup", action: "create:any", attributes: "*" },
          { resource: "RecipeGroup", action: "read:any", attributes: "*" },
          { resource: "RecipeGroup", action: "update:any", attributes: "*" },
          { resource: "RecipeGroup", action: "delete:any", attributes: "*" },
          {
            resource: "RecipeParameter",
            action: "create:any",
            attributes: "*",
          },
          { resource: "RecipeParameter", action: "read:any", attributes: "*" },
          {
            resource: "RecipeParameter",
            action: "update:any",
            attributes: "*",
          },
          {
            resource: "RecipeParameter",
            action: "delete:any",
            attributes: "*",
          },
          { resource: "SalesOrder", action: "create:any", attributes: "*" },
          { resource: "SalesOrder", action: "read:any", attributes: "*" },
          { resource: "SalesOrder", action: "update:any", attributes: "*" },
          { resource: "SalesOrder", action: "delete:any", attributes: "*" },
          { resource: "ScheduleOrder", action: "create:any", attributes: "*" },
          { resource: "ScheduleOrder", action: "read:any", attributes: "*" },
          { resource: "ScheduleOrder", action: "update:any", attributes: "*" },
          { resource: "ScheduleOrder", action: "delete:any", attributes: "*" },
          {
            resource: "ScheduleOrderQueue",
            action: "create:any",
            attributes: "*",
          },
          {
            resource: "ScheduleOrderQueue",
            action: "read:any",
            attributes: "*",
          },
          {
            resource: "ScheduleOrderQueue",
            action: "update:any",
            attributes: "*",
          },
          {
            resource: "ScheduleOrderQueue",
            action: "delete:any",
            attributes: "*",
          },
          { resource: "Storage", action: "create:any", attributes: "*" },
          { resource: "Storage", action: "read:any", attributes: "*" },
          { resource: "Storage", action: "update:any", attributes: "*" },
          { resource: "Storage", action: "delete:any", attributes: "*" },
          { resource: "Test", action: "create:any", attributes: "*" },
          { resource: "Test", action: "read:any", attributes: "*" },
          { resource: "Test", action: "update:any", attributes: "*" },
          { resource: "Test", action: "delete:any", attributes: "*" },
          { resource: "TestParameter", action: "create:any", attributes: "*" },
          { resource: "TestParameter", action: "read:any", attributes: "*" },
          { resource: "TestParameter", action: "update:any", attributes: "*" },
          { resource: "TestParameter", action: "delete:any", attributes: "*" },
          { resource: "UnitLookup", action: "create:any", attributes: "*" },
          { resource: "UnitLookup", action: "read:any", attributes: "*" },
          { resource: "UnitLookup", action: "update:any", attributes: "*" },
          { resource: "UnitLookup", action: "delete:any", attributes: "*" },
          { resource: "UnitProcedure", action: "create:any", attributes: "*" },
          { resource: "UnitProcedure", action: "read:any", attributes: "*" },
          { resource: "UnitProcedure", action: "update:any", attributes: "*" },
          { resource: "UnitProcedure", action: "delete:any", attributes: "*" },
          { resource: "Units", action: "create:any", attributes: "*" },
          { resource: "Units", action: "read:any", attributes: "*" },
          { resource: "Units", action: "update:any", attributes: "*" },
          { resource: "Units", action: "delete:any", attributes: "*" },
          {
            resource: "UnsBrokerConfiguration",
            action: "create:any",
            attributes: "*",
          },
          {
            resource: "UnsBrokerConfiguration",
            action: "read:any",
            attributes: "*",
          },
          {
            resource: "UnsBrokerConfiguration",
            action: "update:any",
            attributes: "*",
          },
          {
            resource: "UnsBrokerConfiguration",
            action: "delete:any",
            attributes: "*",
          },
          {
            resource: "UnsConfiguration",
            action: "create:any",
            attributes: "*",
          },
          { resource: "UnsConfiguration", action: "read:any", attributes: "*" },
          {
            resource: "UnsConfiguration",
            action: "update:any",
            attributes: "*",
          },
          {
            resource: "UnsConfiguration",
            action: "delete:any",
            attributes: "*",
          },
          { resource: "User", action: "create:any", attributes: "*" },
          { resource: "User", action: "read:any", attributes: "*" },
          { resource: "User", action: "update:any", attributes: "*" },
          { resource: "User", action: "delete:any", attributes: "*" },
          { resource: "Vendor", action: "create:any", attributes: "*" },
          { resource: "Vendor", action: "read:any", attributes: "*" },
          { resource: "Vendor", action: "update:any", attributes: "*" },
          { resource: "Vendor", action: "delete:any", attributes: "*" },
          { resource: "Widget", action: "create:any", attributes: "*" },
          { resource: "Widget", action: "read:any", attributes: "*" },
          { resource: "Widget", action: "update:any", attributes: "*" },
          { resource: "Widget", action: "delete:any", attributes: "*" },
        ],
        operationsDistilleryOperator: [
          { resource: "AdditiveActual", action: "read:any", attributes: "*" },
          { resource: "Asset", action: "read:any", attributes: "*" },
          { resource: "AuditLog", action: "read:any", attributes: "*" },
          { resource: "Batch", action: "read:any", attributes: "*" },
          { resource: "Bom", action: "read:any", attributes: "*" },
          { resource: "BomItem", action: "read:any", attributes: "*" },
          { resource: "Comment", action: "read:any", attributes: "*" },
          { resource: "Customer", action: "read:any", attributes: "*" },
          { resource: "EquipmentPhase", action: "read:any", attributes: "*" },
          { resource: "FormulaLibrary", action: "read:any", attributes: "*" },
          { resource: "Instruction", action: "read:any", attributes: "*" },
          { resource: "Inventory", action: "read:any", attributes: "*" },
          { resource: "InventoryLog", action: "read:any", attributes: "*" },
          {
            resource: "InventoryTransfer",
            action: "read:any",
            attributes: "*",
          },
          { resource: "Item", action: "read:any", attributes: "*" },
          { resource: "ItemGroup", action: "read:any", attributes: "*" },
          { resource: "ItemReceipt", action: "read:any", attributes: "*" },
          { resource: "Lot", action: "read:any", attributes: "*" },
          { resource: "MashingProtocol", action: "read:any", attributes: "*" },
          {
            resource: "MashingProtocolStep",
            action: "read:any",
            attributes: "*",
          },
          {
            resource: "MashingProtocolStepActual",
            action: "read:any",
            attributes: "*",
          },
          {
            resource: "MillingBinConfiguration",
            action: "read:any",
            attributes: "*",
          },
          { resource: "Notification", action: "read:any", attributes: "*" },
          { resource: "Operation", action: "read:any", attributes: "*" },
          { resource: "PhaseParameter", action: "read:any", attributes: "*" },
          { resource: "Procedure", action: "read:any", attributes: "*" },
          { resource: "ProductionOrder", action: "read:any", attributes: "*" },
          {
            resource: "ProductionOrderBomItem",
            action: "read:any",
            attributes: "*",
          },
          {
            resource: "ProductionOrderRecipeInstance",
            action: "read:any",
            attributes: "*",
          },
          { resource: "PurchaseOrder", action: "read:any", attributes: "*" },
          { resource: "Recipe", action: "read:any", attributes: "*" },
          { resource: "RecipeBom", action: "read:any", attributes: "*" },
          { resource: "RecipeBomActual", action: "read:any", attributes: "*" },
          { resource: "RecipeBomItem", action: "read:any", attributes: "*" },
          { resource: "RecipeGroup", action: "read:any", attributes: "*" },
          { resource: "RecipeParameter", action: "read:any", attributes: "*" },
          { resource: "SalesOrder", action: "read:any", attributes: "*" },
          { resource: "ScheduleOrder", action: "read:any", attributes: "*" },
          {
            resource: "ScheduleOrderQueue",
            action: "read:any",
            attributes: "*",
          },
          { resource: "Storage", action: "read:any", attributes: "*" },
          { resource: "Test", action: "read:any", attributes: "*" },
          { resource: "TestParameter", action: "read:any", attributes: "*" },
          { resource: "UnitLookup", action: "read:any", attributes: "*" },
          { resource: "UnitProcedure", action: "read:any", attributes: "*" },
          { resource: "Units", action: "read:any", attributes: "*" },
          {
            resource: "UnsBrokerConfiguration",
            action: "read:any",
            attributes: "*",
          },
          { resource: "UnsConfiguration", action: "read:any", attributes: "*" },
          { resource: "User", action: "read:any", attributes: "*" },
          { resource: "Vendor", action: "read:any", attributes: "*" },
          { resource: "Widget", action: "read:any", attributes: "*" },
        ],
        user: [
          { resource: "AdditiveActual", action: "read:own", attributes: "*" },
          { resource: "Asset", action: "read:own", attributes: "*" },
          { resource: "AuditLog", action: "read:own", attributes: "*" },
          { resource: "Batch", action: "read:own", attributes: "*" },
          { resource: "Bom", action: "read:own", attributes: "*" },
          { resource: "BomItem", action: "read:own", attributes: "*" },
          { resource: "Comment", action: "read:own", attributes: "*" },
          { resource: "Customer", action: "read:own", attributes: "*" },
          { resource: "EquipmentPhase", action: "read:own", attributes: "*" },
          { resource: "FormulaLibrary", action: "read:own", attributes: "*" },
          { resource: "Instruction", action: "read:own", attributes: "*" },
          { resource: "Inventory", action: "read:own", attributes: "*" },
          { resource: "InventoryLog", action: "read:own", attributes: "*" },
          {
            resource: "InventoryTransfer",
            action: "read:own",
            attributes: "*",
          },
          { resource: "Item", action: "read:own", attributes: "*" },
          { resource: "ItemGroup", action: "read:own", attributes: "*" },
          { resource: "ItemReceipt", action: "read:own", attributes: "*" },
          { resource: "Lot", action: "read:own", attributes: "*" },
          { resource: "MashingProtocol", action: "read:own", attributes: "*" },
          {
            resource: "MashingProtocolStep",
            action: "read:own",
            attributes: "*",
          },
          {
            resource: "MashingProtocolStepActual",
            action: "read:own",
            attributes: "*",
          },
          {
            resource: "MillingBinConfiguration",
            action: "read:own",
            attributes: "*",
          },
          { resource: "Notification", action: "read:own", attributes: "*" },
          { resource: "Operation", action: "read:own", attributes: "*" },
          { resource: "PhaseParameter", action: "read:own", attributes: "*" },
          { resource: "Procedure", action: "read:own", attributes: "*" },
          { resource: "ProductionOrder", action: "read:own", attributes: "*" },
          {
            resource: "ProductionOrderBomItem",
            action: "read:own",
            attributes: "*",
          },
          {
            resource: "ProductionOrderRecipeInstance",
            action: "read:own",
            attributes: "*",
          },
          { resource: "PurchaseOrder", action: "read:own", attributes: "*" },
          { resource: "Recipe", action: "read:own", attributes: "*" },
          { resource: "RecipeBom", action: "read:own", attributes: "*" },
          { resource: "RecipeBomActual", action: "read:own", attributes: "*" },
          { resource: "RecipeBomItem", action: "read:own", attributes: "*" },
          { resource: "RecipeGroup", action: "read:own", attributes: "*" },
          { resource: "RecipeParameter", action: "read:own", attributes: "*" },
          { resource: "SalesOrder", action: "read:own", attributes: "*" },
          { resource: "ScheduleOrder", action: "read:own", attributes: "*" },
          {
            resource: "ScheduleOrderQueue",
            action: "read:own",
            attributes: "*",
          },
          { resource: "Storage", action: "read:own", attributes: "*" },
          { resource: "Test", action: "read:own", attributes: "*" },
          { resource: "TestParameter", action: "read:own", attributes: "*" },
          { resource: "UnitLookup", action: "read:own", attributes: "*" },
          { resource: "UnitProcedure", action: "read:own", attributes: "*" },
          { resource: "Units", action: "read:own", attributes: "*" },
          {
            resource: "UnsBrokerConfiguration",
            action: "read:own",
            attributes: "*",
          },
          { resource: "UnsConfiguration", action: "read:own", attributes: "*" },
          { resource: "User", action: "read:own", attributes: "*" },
          { resource: "Vendor", action: "read:own", attributes: "*" },
          { resource: "Widget", action: "read:own", attributes: "*" },
        ],
      },
      roleInheritance: {
        eTAdmin: "operationsDistilleryOperator",
        eTDeveloper: "operationsDistilleryOperator",
        operationDistilleryOperator: "operationsDistilleryOperator",
        operationsDistilleryLeadership: "operationsDistilleryOperator",
        operationsDistilleryShiftlead: "operationsDistilleryOperator",
        operationsDistillerySupervisor: "operationsDistilleryOperator",
        operationsDistilleryTechnician: "operationsDistilleryOperator",
        operationsDistilleryTechnician2: "operationsDistilleryOperator",
        operationsDistilleryTechnician3: "operationsDistilleryOperator",
        manager: "admin",
        operator: "admin",
        supervisor: "admin",
        user: "operationsDistilleryOperator",
        test: "operationsDistilleryOperator",
      },
      uniquePermissions: {
        admin: [
          {
            resource: "EnzymeConfiguration",
            action: "read:any",
            attributes: "*",
          },
        ],
      },
    };
  }

  /**
   * Get all roles in the system
   */
  getAllRoles(): string[] {
    const baseRoles = Object.keys(this.optimizedGrants.basePermissions);
    const inheritingRoles = Object.keys(this.optimizedGrants.roleInheritance);
    return [...baseRoles, ...inheritingRoles];
  }

  /**
   * Get all permissions for a specific role, including inherited permissions
   */
  getPermissionsForRole(role: string): Permission[] {
    const permissions: Permission[] = [];

    // Check if this role has base permissions
    if (this.optimizedGrants.basePermissions[role]) {
      permissions.push(...this.optimizedGrants.basePermissions[role]);
    }

    // Check if this role inherits from another role
    if (this.optimizedGrants.roleInheritance[role]) {
      const parentRole = this.optimizedGrants.roleInheritance[role];
      if (this.optimizedGrants.basePermissions[parentRole]) {
        permissions.push(...this.optimizedGrants.basePermissions[parentRole]);
      }
    }

    // Add unique permissions for this role
    if (this.optimizedGrants.uniquePermissions[role]) {
      permissions.push(...this.optimizedGrants.uniquePermissions[role]);
    }

    return permissions;
  }

  /**
   * Generate the full grants array compatible with nest-access-control
   * This is the drop-in replacement for the original grants.json
   */
  generateFullGrants(): any[] {
    const grants: any[] = [];
    const allRoles = this.getAllRoles();

    allRoles.forEach((role) => {
      const permissions = this.getPermissionsForRole(role);
      permissions.forEach((permission) => {
        grants.push({
          role,
          resource: permission.resource,
          action: permission.action,
          attributes: permission.attributes,
        });
      });
    });

    return grants;
  }

  /**
   * Check if a role has a specific permission
   */
  hasPermission(role: string, resource: string, action: string): boolean {
    const permissions = this.getPermissionsForRole(role);
    return permissions.some(
      (p) => p.resource === resource && p.action === action
    );
  }

  /**
   * Get statistics about the optimization
   */
  getOptimizationStats(): {
    totalRoles: number;
    baseRoles: number;
    inheritingRoles: number;
    totalPermissions: number;
    estimatedOriginalSize: number;
    compressionRatio: string;
  } {
    const allRoles = this.getAllRoles();
    const baseRoles = Object.keys(this.optimizedGrants.basePermissions);
    const inheritingRoles = Object.keys(this.optimizedGrants.roleInheritance);
    const fullGrants = this.generateFullGrants();

    // Calculate the size of our optimized structure
    const optimizedSize = JSON.stringify(this.optimizedGrants).length;
    const originalSize = JSON.stringify(fullGrants).length;

    return {
      totalRoles: allRoles.length,
      baseRoles: baseRoles.length,
      inheritingRoles: inheritingRoles.length,
      totalPermissions: fullGrants.length,
      estimatedOriginalSize: originalSize,
      compressionRatio: `${((1 - optimizedSize / originalSize) * 100).toFixed(
        1
      )}%`,
    };
  }
}
