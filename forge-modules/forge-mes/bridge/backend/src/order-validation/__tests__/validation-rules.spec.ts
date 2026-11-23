import {
  ValidationRuleEngine,
  VALIDATION_RULES,
  CONTAINER_TYPE_MAPPINGS,
} from "../validation-rules";
import { EnumProductionOrderContainerType } from "@prisma/client";

describe("ValidationRuleEngine", () => {
  describe("isRuleEnabled", () => {
    it("should return true for enabled rules", () => {
      const result = ValidationRuleEngine.isRuleEnabled("PO_SINGLE_CUSTOMER");
      expect(result).toBe(true);
    });

    it("should return false for non-existent rules", () => {
      const result = ValidationRuleEngine.isRuleEnabled("NON_EXISTENT_RULE");
      expect(result).toBe(false);
    });

    it("should handle disabled rules correctly", () => {
      // Assuming all rules are enabled by default in the configuration
      const enabledRule = VALIDATION_RULES.find((rule) => rule.enabled);
      expect(enabledRule).toBeDefined();

      if (enabledRule) {
        const result = ValidationRuleEngine.isRuleEnabled(enabledRule.id);
        expect(result).toBe(true);
      }
    });
  });

  describe("getRulesByCategory", () => {
    it("should return production order rules", () => {
      const rules = ValidationRuleEngine.getRulesByCategory("production_order");

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.every((rule) => rule.category === "production_order")).toBe(
        true
      );
      expect(rules.every((rule) => rule.enabled)).toBe(true);

      // Check for specific production order rules
      const customerRule = rules.find(
        (rule) => rule.id === "PO_SINGLE_CUSTOMER"
      );
      expect(customerRule).toBeDefined();
      expect(customerRule?.description).toContain("one customer");
    });

    it("should return schedule order rules", () => {
      const rules = ValidationRuleEngine.getRulesByCategory("schedule_order");

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.every((rule) => rule.category === "schedule_order")).toBe(
        true
      );
      expect(rules.every((rule) => rule.enabled)).toBe(true);

      // Check for specific schedule order rules
      const mashBillRule = rules.find(
        (rule) => rule.id === "SO_SINGLE_MASH_BILL"
      );
      expect(mashBillRule).toBeDefined();
    });

    it("should return cross-order rules", () => {
      const rules = ValidationRuleEngine.getRulesByCategory("cross_order");

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.every((rule) => rule.category === "cross_order")).toBe(true);
      expect(rules.every((rule) => rule.enabled)).toBe(true);

      // Check for specific cross-order rules
      const consistencyRule = rules.find(
        (rule) => rule.id === "CO_MASH_BILL_CONSISTENCY"
      );
      expect(consistencyRule).toBeDefined();
    });

    it("should return empty array for non-existent category", () => {
      const rules = ValidationRuleEngine.getRulesByCategory(
        "non_existent" as any
      );
      expect(rules).toEqual([]);
    });
  });

  describe("getContainerTypeMapping", () => {
    it("should return mapping for LargeBarrel", () => {
      const mapping =
        ValidationRuleEngine.getContainerTypeMapping("LargeBarrel");

      expect(mapping).toBeDefined();
      expect(mapping?.containerType).toBe("LargeBarrel");
      expect(mapping?.requiresItemSelection).toBe(true);
      expect(mapping?.itemGroupPatterns).toContain("BARREL-53GAL");
      expect(mapping?.itemGroupPatterns).toContain("BARREL_53");
      expect(mapping?.itemGroupPatterns).toContain("53GAL");
      expect(mapping?.description).toContain("53-gallon");
    });

    it("should return mapping for SmallBarrel", () => {
      const mapping =
        ValidationRuleEngine.getContainerTypeMapping("SmallBarrel");

      expect(mapping).toBeDefined();
      expect(mapping?.containerType).toBe("SmallBarrel");
      expect(mapping?.requiresItemSelection).toBe(true);
      expect(mapping?.itemGroupPatterns).toContain("BARREL-30GAL");
      expect(mapping?.itemGroupPatterns).toContain("BARREL_30");
      expect(mapping?.itemGroupPatterns).toContain("30GAL");
      expect(mapping?.description).toContain("30-gallon");
    });

    it("should return mapping for BulkLoadout", () => {
      const mapping =
        ValidationRuleEngine.getContainerTypeMapping("BulkLoadout");

      expect(mapping).toBeDefined();
      expect(mapping?.containerType).toBe("BulkLoadout");
      expect(mapping?.requiresItemSelection).toBe(false);
      expect(mapping?.itemGroupPatterns).toEqual([]);
      expect(mapping?.description).toContain("Bulk loadout");
    });

    it("should return mapping for PlasticDrum", () => {
      const mapping =
        ValidationRuleEngine.getContainerTypeMapping("PlasticDrum");

      expect(mapping).toBeDefined();
      expect(mapping?.containerType).toBe("PlasticDrum");
      expect(mapping?.requiresItemSelection).toBe(false);
      expect(mapping?.itemGroupPatterns).toEqual([]);
    });

    it("should return mapping for IBC and SS totes", () => {
      const ibcMapping =
        ValidationRuleEngine.getContainerTypeMapping("IbcTote275");
      const ssMapping =
        ValidationRuleEngine.getContainerTypeMapping("SsTote275");

      expect(ibcMapping).toBeDefined();
      expect(ibcMapping?.requiresItemSelection).toBe(false);
      expect(ibcMapping?.description).toContain("275-gallon");

      expect(ssMapping).toBeDefined();
      expect(ssMapping?.requiresItemSelection).toBe(false);
      expect(ssMapping?.description).toContain("275-gallon");
    });

    it("should return undefined for non-existent container type", () => {
      const mapping = ValidationRuleEngine.getContainerTypeMapping(
        "NonExistent" as any
      );
      expect(mapping).toBeUndefined();
    });
  });

  describe("requiresContainerItemSelection", () => {
    it("should return true for barrel types", () => {
      expect(
        ValidationRuleEngine.requiresContainerItemSelection("LargeBarrel")
      ).toBe(true);
      expect(
        ValidationRuleEngine.requiresContainerItemSelection("SmallBarrel")
      ).toBe(true);
    });

    it("should return false for non-barrel types", () => {
      expect(
        ValidationRuleEngine.requiresContainerItemSelection("BulkLoadout")
      ).toBe(false);
      expect(
        ValidationRuleEngine.requiresContainerItemSelection("PlasticDrum")
      ).toBe(false);
      expect(
        ValidationRuleEngine.requiresContainerItemSelection("IbcTote275")
      ).toBe(false);
      expect(
        ValidationRuleEngine.requiresContainerItemSelection("SsTote275")
      ).toBe(false);
    });

    it("should return false for non-existent container type", () => {
      expect(
        ValidationRuleEngine.requiresContainerItemSelection(
          "NonExistent" as any
        )
      ).toBe(false);
    });
  });

  describe("getItemGroupPatternsForContainer", () => {
    it("should return patterns for LargeBarrel", () => {
      const patterns =
        ValidationRuleEngine.getItemGroupPatternsForContainer("LargeBarrel");

      expect(patterns).toEqual(["BARREL-53GAL", "BARREL_53", "53GAL"]);
    });

    it("should return patterns for SmallBarrel", () => {
      const patterns =
        ValidationRuleEngine.getItemGroupPatternsForContainer("SmallBarrel");

      expect(patterns).toEqual(["BARREL-30GAL", "BARREL_30", "30GAL"]);
    });

    it("should return empty array for non-barrel types", () => {
      expect(
        ValidationRuleEngine.getItemGroupPatternsForContainer("BulkLoadout")
      ).toEqual([]);
      expect(
        ValidationRuleEngine.getItemGroupPatternsForContainer("PlasticDrum")
      ).toEqual([]);
      expect(
        ValidationRuleEngine.getItemGroupPatternsForContainer("IbcTote275")
      ).toEqual([]);
      expect(
        ValidationRuleEngine.getItemGroupPatternsForContainer("SsTote275")
      ).toEqual([]);
    });

    it("should return empty array for non-existent container type", () => {
      const patterns = ValidationRuleEngine.getItemGroupPatternsForContainer(
        "NonExistent" as any
      );
      expect(patterns).toEqual([]);
    });
  });
});

describe("VALIDATION_RULES", () => {
  it("should have all required production order rules", () => {
    const productionOrderRules = VALIDATION_RULES.filter(
      (rule) => rule.category === "production_order"
    );

    const expectedRuleIds = [
      "PO_SINGLE_CUSTOMER",
      "PO_SINGLE_MASH_BILL",
      "PO_SINGLE_CONTAINER_TYPE",
      "PO_SINGLE_PROOF",
      "PO_SINGLE_BOM",
      "PO_SINGLE_FG_ITEM",
      "PO_CONTAINER_ITEM_REQUIRED",
      "PO_CONTAINER_ITEM_SINGLE",
      "PO_CONTAINER_ITEM_TYPE_MATCH",
      "PO_PRODUCTION_BOM_ONLY",
    ];

    expectedRuleIds.forEach((ruleId) => {
      const rule = productionOrderRules.find((r) => r.id === ruleId);
      expect(rule).toBeDefined();
      expect(rule?.enabled).toBe(true);
      expect(rule?.severity).toMatch(/^(error|warning)$/);
    });
  });

  it("should have all required schedule order rules", () => {
    const scheduleOrderRules = VALIDATION_RULES.filter(
      (rule) => rule.category === "schedule_order"
    );

    const expectedRuleIds = [
      "SO_SINGLE_MASH_BILL",
      "SO_RECIPE_BOM_REQUIRED",
      "SO_RECIPE_BOM_ADDITIVES",
      "SO_RECIPE_BOM_YEAST",
      "SO_RECIPE_BOM_GRAIN",
    ];

    expectedRuleIds.forEach((ruleId) => {
      const rule = scheduleOrderRules.find((r) => r.id === ruleId);
      expect(rule).toBeDefined();
      expect(rule?.enabled).toBe(true);
    });
  });

  it("should have all required cross-order rules", () => {
    const crossOrderRules = VALIDATION_RULES.filter(
      (rule) => rule.category === "cross_order"
    );

    const expectedRuleIds = [
      "CO_MASH_BILL_CONSISTENCY",
      "CO_RECIPE_BOM_SUPPORT",
    ];

    expectedRuleIds.forEach((ruleId) => {
      const rule = crossOrderRules.find((r) => r.id === ruleId);
      expect(rule).toBeDefined();
      expect(rule?.enabled).toBe(true);
    });
  });

  it("should have unique rule IDs", () => {
    const ruleIds = VALIDATION_RULES.map((rule) => rule.id);
    const uniqueRuleIds = [...new Set(ruleIds)];

    expect(ruleIds.length).toBe(uniqueRuleIds.length);
  });

  it("should have valid categories and severities", () => {
    const validCategories = [
      "production_order",
      "schedule_order",
      "cross_order",
    ];
    const validSeverities = ["error", "warning"];

    VALIDATION_RULES.forEach((rule) => {
      expect(validCategories).toContain(rule.category);
      expect(validSeverities).toContain(rule.severity);
      expect(typeof rule.enabled).toBe("boolean");
      expect(rule.description).toBeTruthy();
    });
  });
});

describe("CONTAINER_TYPE_MAPPINGS", () => {
  it("should have mappings for all container types", () => {
    const expectedContainerTypes = [
      "LargeBarrel",
      "SmallBarrel",
      "BulkLoadout",
      "PlasticDrum",
      "IbcTote275",
      "SsTote275",
    ];

    expectedContainerTypes.forEach((containerType) => {
      const mapping = CONTAINER_TYPE_MAPPINGS.find(
        (m) => m.containerType === containerType
      );
      expect(mapping).toBeDefined();
      expect(mapping?.description).toBeTruthy();
      expect(typeof mapping?.requiresItemSelection).toBe("boolean");
      expect(Array.isArray(mapping?.itemGroupPatterns)).toBe(true);
    });
  });

  it("should have correct barrel configuration", () => {
    const largeBarrel = CONTAINER_TYPE_MAPPINGS.find(
      (m) => m.containerType === "LargeBarrel"
    );
    const smallBarrel = CONTAINER_TYPE_MAPPINGS.find(
      (m) => m.containerType === "SmallBarrel"
    );

    expect(largeBarrel?.requiresItemSelection).toBe(true);
    expect(largeBarrel?.itemGroupPatterns.length).toBeGreaterThan(0);
    expect(largeBarrel?.itemGroupPatterns).toContain("BARREL-53GAL");

    expect(smallBarrel?.requiresItemSelection).toBe(true);
    expect(smallBarrel?.itemGroupPatterns.length).toBeGreaterThan(0);
    expect(smallBarrel?.itemGroupPatterns).toContain("BARREL-30GAL");
  });

  it("should have correct non-barrel configuration", () => {
    const nonBarrelTypes = [
      "BulkLoadout",
      "PlasticDrum",
      "IbcTote275",
      "SsTote275",
    ];

    nonBarrelTypes.forEach((containerType) => {
      const mapping = CONTAINER_TYPE_MAPPINGS.find(
        (m) => m.containerType === containerType
      );
      expect(mapping?.requiresItemSelection).toBe(false);
      expect(mapping?.itemGroupPatterns).toEqual([]);
    });
  });

  it("should have unique container types", () => {
    const containerTypes = CONTAINER_TYPE_MAPPINGS.map(
      (mapping) => mapping.containerType
    );
    const uniqueContainerTypes = [...new Set(containerTypes)];

    expect(containerTypes.length).toBe(uniqueContainerTypes.length);
  });
});
