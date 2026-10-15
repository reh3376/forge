import { EnumProductionOrderContainerType } from "@prisma/client";

export interface ValidationRule {
  id: string;
  description: string;
  category: "production_order" | "schedule_order" | "cross_order";
  severity: "error" | "warning";
  enabled: boolean;
}

export const VALIDATION_RULES: ValidationRule[] = [
  // Production Order Rules
  {
    id: "PO_SINGLE_CUSTOMER",
    description: "Production Order must be specific to one customer",
    category: "production_order",
    severity: "error",
    enabled: true,
  },
  {
    id: "PO_SINGLE_MASH_BILL",
    description: "Production Order must be specific to one mash bill",
    category: "production_order",
    severity: "error",
    enabled: true,
  },
  {
    id: "PO_SINGLE_CONTAINER_TYPE",
    description: "Production Order must specify one container type",
    category: "production_order",
    severity: "error",
    enabled: true,
  },
  {
    id: "PO_SINGLE_PROOF",
    description: "Production Order must specify one final proof",
    category: "production_order",
    severity: "error",
    enabled: true,
  },
  {
    id: "PO_SINGLE_BOM",
    description: "Production Order must be tied to one production BOM",
    category: "production_order",
    severity: "error",
    enabled: true,
  },
  {
    id: "PO_SINGLE_FG_ITEM",
    description: "Production Order must specify one final goods item code",
    category: "production_order",
    severity: "error",
    enabled: true,
  },
  {
    id: "PO_CONTAINER_ITEM_REQUIRED",
    description: "Barrel container types must have container item selected",
    category: "production_order",
    severity: "error",
    enabled: true,
  },
  {
    id: "PO_CONTAINER_ITEM_SINGLE",
    description: "Only one container item can be selected per Production Order",
    category: "production_order",
    severity: "error",
    enabled: true,
  },
  {
    id: "PO_CONTAINER_ITEM_TYPE_MATCH",
    description: "Container item must match selected container type",
    category: "production_order",
    severity: "error",
    enabled: true,
  },
  {
    id: "PO_PRODUCTION_BOM_ONLY",
    description: "Production Orders must use Production BOMs, not Recipe BOMs",
    category: "production_order",
    severity: "error",
    enabled: true,
  },

  // Schedule Order Rules
  {
    id: "SO_SINGLE_MASH_BILL",
    description: "Schedule Order must be specific to one mash bill",
    category: "schedule_order",
    severity: "error",
    enabled: true,
  },
  {
    id: "SO_RECIPE_BOM_REQUIRED",
    description: "Schedule Order must have a Recipe BOM",
    category: "schedule_order",
    severity: "error",
    enabled: true,
  },
  {
    id: "SO_RECIPE_BOM_ADDITIVES",
    description: "Recipe BOM must include mashing additives",
    category: "schedule_order",
    severity: "error",
    enabled: true,
  },
  {
    id: "SO_RECIPE_BOM_YEAST",
    description: "Recipe BOM must include yeast specifications",
    category: "schedule_order",
    severity: "error",
    enabled: true,
  },
  {
    id: "SO_RECIPE_BOM_GRAIN",
    description: "Recipe BOM must include grain components",
    category: "schedule_order",
    severity: "error",
    enabled: true,
  },

  // Cross-Order Rules
  {
    id: "CO_MASH_BILL_CONSISTENCY",
    description:
      "All Production Orders under a Schedule Order must share the same mash bill",
    category: "cross_order",
    severity: "error",
    enabled: true,
  },
  {
    id: "CO_RECIPE_BOM_SUPPORT",
    description: "Recipe BOM must support all grouped Production Orders",
    category: "cross_order",
    severity: "warning",
    enabled: true,
  },
];

export interface ContainerTypeMapping {
  containerType: EnumProductionOrderContainerType;
  itemGroupPatterns: string[];
  description: string;
  requiresItemSelection: boolean;
}

export const CONTAINER_TYPE_MAPPINGS: ContainerTypeMapping[] = [
  {
    containerType: "LargeBarrel",
    itemGroupPatterns: ["BARREL-53GAL", "BARREL_53", "53GAL"],
    description: "53-gallon barrel",
    requiresItemSelection: true,
  },
  {
    containerType: "SmallBarrel",
    itemGroupPatterns: ["BARREL-30GAL", "BARREL_30", "30GAL"],
    description: "30-gallon barrel",
    requiresItemSelection: true,
  },
  {
    containerType: "BulkLoadout",
    itemGroupPatterns: [],
    description: "Bulk loadout container",
    requiresItemSelection: false,
  },
  {
    containerType: "PlasticDrum",
    itemGroupPatterns: [],
    description: "Plastic drum container",
    requiresItemSelection: false,
  },
  {
    containerType: "IbcTote275",
    itemGroupPatterns: [],
    description: "275-gallon IBC tote",
    requiresItemSelection: false,
  },
  {
    containerType: "SsTote275",
    itemGroupPatterns: [],
    description: "275-gallon stainless steel tote",
    requiresItemSelection: false,
  },
];

export class ValidationRuleEngine {
  static isRuleEnabled(ruleId: string): boolean {
    const rule = VALIDATION_RULES.find((r) => r.id === ruleId);
    return rule?.enabled ?? false;
  }

  static getRulesByCategory(
    category: ValidationRule["category"]
  ): ValidationRule[] {
    return VALIDATION_RULES.filter(
      (rule) => rule.category === category && rule.enabled
    );
  }

  static getContainerTypeMapping(
    containerType: EnumProductionOrderContainerType
  ): ContainerTypeMapping | undefined {
    return CONTAINER_TYPE_MAPPINGS.find(
      (mapping) => mapping.containerType === containerType
    );
  }

  static requiresContainerItemSelection(
    containerType: EnumProductionOrderContainerType
  ): boolean {
    const mapping = this.getContainerTypeMapping(containerType);
    return mapping?.requiresItemSelection ?? false;
  }

  static getItemGroupPatternsForContainer(
    containerType: EnumProductionOrderContainerType
  ): string[] {
    const mapping = this.getContainerTypeMapping(containerType);
    return mapping?.itemGroupPatterns ?? [];
  }
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  rule: string;
  message: string;
  field?: string;
  value?: any;
}

export interface ValidationWarning {
  rule: string;
  message: string;
  field?: string;
  value?: any;
}
