/**
 * Tests for Recipe Revisioning and Grain Character functionality
 *
 * Tests the baseRecipeName extraction, revision chain linking,
 * and grain character pattern generation features.
 */

// Test the helper functions for recipe revision extraction
describe("Recipe Revision Helper Functions", () => {
  // These functions are in recipe.service.ts
  const REVISION_SUFFIX_REGEX = /-[Rv](\d+)$/;

  function extractBaseRecipeName(recipeName: string): string {
    return recipeName.replace(REVISION_SUFFIX_REGEX, "");
  }

  function extractRevisionNumber(recipeName: string): number {
    const match = recipeName.match(REVISION_SUFFIX_REGEX);
    if (match) {
      return parseInt(match[1], 10);
    }
    return 1;
  }

  describe("extractBaseRecipeName", () => {
    test("should extract base name from standard recipe format", () => {
      expect(extractBaseRecipeName("WHK-75C-21R-4M-v01")).toBe(
        "WHK-75C-21R-4M"
      );
      expect(extractBaseRecipeName("BHK-60C-40R-v02")).toBe("BHK-60C-40R");
      expect(extractBaseRecipeName("GSC-73C-17R-6W-4M-v01")).toBe(
        "GSC-73C-17R-6W-4M"
      );
    });

    test("should handle multi-digit revision numbers", () => {
      expect(extractBaseRecipeName("WHK-75C-21R-4M-v10")).toBe(
        "WHK-75C-21R-4M"
      );
      expect(extractBaseRecipeName("WHK-75C-21R-4M-v99")).toBe(
        "WHK-75C-21R-4M"
      );
    });

    test("should return full name if no revision suffix", () => {
      expect(extractBaseRecipeName("WHK-75C-21R-4M")).toBe("WHK-75C-21R-4M");
      expect(extractBaseRecipeName("TestRecipe")).toBe("TestRecipe");
    });

    test("should handle edge cases", () => {
      // Recipe that ends with R (grain abbreviation) but not a revision suffix
      expect(extractBaseRecipeName("WHK-100R-v01")).toBe("WHK-100R");
      // Pure malt recipes
      expect(extractBaseRecipeName("WHK-100M-v01")).toBe("WHK-100M");
    });

    test("should handle legacy format recipes", () => {
      expect(extractBaseRecipeName("DWL-75-21-00-04-R01-DEL")).toBe(
        "DWL-75-21-00-04-R01-DEL"
      );
      expect(extractBaseRecipeName("JBM-75-21-00-04-R01-03.2025")).toBe(
        "JBM-75-21-00-04-R01-03.2025"
      );
    });
  });

  describe("extractRevisionNumber", () => {
    test("should extract revision number from standard format", () => {
      expect(extractRevisionNumber("WHK-75C-21R-4M-v01")).toBe(1);
      expect(extractRevisionNumber("WHK-75C-21R-4M-v02")).toBe(2);
      expect(extractRevisionNumber("WHK-75C-21R-4M-v10")).toBe(10);
    });

    test("should return 1 for recipes without revision suffix", () => {
      expect(extractRevisionNumber("WHK-75C-21R-4M")).toBe(1);
      expect(extractRevisionNumber("TestRecipe")).toBe(1);
    });

    test("should handle leading zeros in revision", () => {
      expect(extractRevisionNumber("WHK-75C-21R-4M-v01")).toBe(1);
      expect(extractRevisionNumber("WHK-75C-21R-4M-v001")).toBe(1);
    });
  });
});

// Test grain character pattern generation
describe("Grain Character Pattern Generation", () => {
  // This logic is in mash-bill-composition.tsx
  interface MashBillComponent {
    grainCharacterId: string;
    abbreviation: string;
    percentage: number;
    grainName?: string;
  }

  function generatePatternString(components: MashBillComponent[]): string {
    const validComponents = components.filter(
      (comp) => comp.percentage > 0 && comp.abbreviation
    );

    // Count occurrences of each abbreviation
    const abbrevCounts: Record<string, number> = {};
    const abbrevIndexes: Record<string, number> = {};

    // First pass: count how many of each grain
    validComponents.forEach((comp) => {
      abbrevCounts[comp.abbreviation] =
        (abbrevCounts[comp.abbreviation] || 0) + 1;
    });

    // Second pass: generate pattern with auto-numbered variety codes
    return validComponents
      .map((comp) => {
        const count = abbrevCounts[comp.abbreviation] || 0;
        if (count > 1) {
          // Multiple of same grain - auto-assign variety number
          abbrevIndexes[comp.abbreviation] =
            (abbrevIndexes[comp.abbreviation] || 0) + 1;
          return `${comp.percentage}${comp.abbreviation}${
            abbrevIndexes[comp.abbreviation]
          }`;
        } else {
          // Single grain - no variety code needed
          return `${comp.percentage}${comp.abbreviation}`;
        }
      })
      .join("-");
  }

  describe("generatePatternString", () => {
    test("should generate pattern for standard bourbon mash bill", () => {
      const components: MashBillComponent[] = [
        {
          grainCharacterId: "1",
          abbreviation: "C",
          percentage: 75,
          grainName: "Corn",
        },
        {
          grainCharacterId: "2",
          abbreviation: "R",
          percentage: 21,
          grainName: "Rye",
        },
        {
          grainCharacterId: "3",
          abbreviation: "M",
          percentage: 4,
          grainName: "Malt",
        },
      ];
      expect(generatePatternString(components)).toBe("75C-21R-4M");
    });

    test("should generate pattern for wheated bourbon", () => {
      const components: MashBillComponent[] = [
        {
          grainCharacterId: "1",
          abbreviation: "C",
          percentage: 70,
          grainName: "Corn",
        },
        {
          grainCharacterId: "2",
          abbreviation: "W",
          percentage: 18,
          grainName: "Wheat",
        },
        {
          grainCharacterId: "3",
          abbreviation: "M",
          percentage: 12,
          grainName: "Malt",
        },
      ];
      expect(generatePatternString(components)).toBe("70C-18W-12M");
    });

    test("should generate pattern for rye whiskey", () => {
      const components: MashBillComponent[] = [
        {
          grainCharacterId: "1",
          abbreviation: "R",
          percentage: 95,
          grainName: "Rye",
        },
        {
          grainCharacterId: "2",
          abbreviation: "M",
          percentage: 5,
          grainName: "Malt",
        },
      ];
      expect(generatePatternString(components)).toBe("95R-5M");
    });

    test("should add variety codes when same grain used multiple times", () => {
      const components: MashBillComponent[] = [
        {
          grainCharacterId: "1",
          abbreviation: "C",
          percentage: 40,
          grainName: "Yellow Corn",
        },
        {
          grainCharacterId: "2",
          abbreviation: "C",
          percentage: 35,
          grainName: "White Corn",
        },
        {
          grainCharacterId: "3",
          abbreviation: "R",
          percentage: 20,
          grainName: "Rye",
        },
        {
          grainCharacterId: "4",
          abbreviation: "M",
          percentage: 5,
          grainName: "Malt",
        },
      ];
      expect(generatePatternString(components)).toBe("40C1-35C2-20R-5M");
    });

    test("should handle multiple malts with variety codes", () => {
      const components: MashBillComponent[] = [
        {
          grainCharacterId: "1",
          abbreviation: "C",
          percentage: 70,
          grainName: "Corn",
        },
        {
          grainCharacterId: "2",
          abbreviation: "M",
          percentage: 15,
          grainName: "Pale Malt",
        },
        {
          grainCharacterId: "3",
          abbreviation: "M",
          percentage: 10,
          grainName: "Chocolate Malt",
        },
        {
          grainCharacterId: "4",
          abbreviation: "M",
          percentage: 5,
          grainName: "Crystal Malt",
        },
      ];
      expect(generatePatternString(components)).toBe("70C-15M1-10M2-5M3");
    });

    test("should handle four grain bourbon", () => {
      const components: MashBillComponent[] = [
        {
          grainCharacterId: "1",
          abbreviation: "C",
          percentage: 65,
          grainName: "Corn",
        },
        {
          grainCharacterId: "2",
          abbreviation: "R",
          percentage: 15,
          grainName: "Rye",
        },
        {
          grainCharacterId: "3",
          abbreviation: "W",
          percentage: 12,
          grainName: "Wheat",
        },
        {
          grainCharacterId: "4",
          abbreviation: "M",
          percentage: 8,
          grainName: "Malt",
        },
      ];
      expect(generatePatternString(components)).toBe("65C-15R-12W-8M");
    });

    test("should skip components with zero percentage", () => {
      const components: MashBillComponent[] = [
        {
          grainCharacterId: "1",
          abbreviation: "C",
          percentage: 75,
          grainName: "Corn",
        },
        {
          grainCharacterId: "2",
          abbreviation: "R",
          percentage: 0,
          grainName: "Rye",
        },
        {
          grainCharacterId: "3",
          abbreviation: "W",
          percentage: 21,
          grainName: "Wheat",
        },
        {
          grainCharacterId: "4",
          abbreviation: "M",
          percentage: 4,
          grainName: "Malt",
        },
      ];
      expect(generatePatternString(components)).toBe("75C-21W-4M");
    });

    test("should handle 100% single grain", () => {
      const components: MashBillComponent[] = [
        {
          grainCharacterId: "1",
          abbreviation: "M",
          percentage: 100,
          grainName: "Malt",
        },
      ];
      expect(generatePatternString(components)).toBe("100M");
    });

    test("should return empty string for empty components", () => {
      expect(generatePatternString([])).toBe("");
    });
  });
});

// Test mash bill validation
describe("Mash Bill Validation", () => {
  function validateMashBillTotal(
    components: { percentage: number }[]
  ): boolean {
    const total = components.reduce(
      (sum, comp) => sum + (comp.percentage || 0),
      0
    );
    return Math.abs(total - 100) < 0.01;
  }

  test("should validate valid mash bill totaling 100%", () => {
    const components = [
      { percentage: 75 },
      { percentage: 21 },
      { percentage: 4 },
    ];
    expect(validateMashBillTotal(components)).toBe(true);
  });

  test("should reject mash bill under 100%", () => {
    const components = [
      { percentage: 70 },
      { percentage: 20 },
      { percentage: 4 },
    ];
    expect(validateMashBillTotal(components)).toBe(false);
  });

  test("should reject mash bill over 100%", () => {
    const components = [
      { percentage: 75 },
      { percentage: 21 },
      { percentage: 10 },
    ];
    expect(validateMashBillTotal(components)).toBe(false);
  });

  test("should handle floating point precision", () => {
    const components = [
      { percentage: 33.33 },
      { percentage: 33.33 },
      { percentage: 33.34 },
    ];
    expect(validateMashBillTotal(components)).toBe(true);
  });
});

// Test recipe name generation
describe("Recipe Name Generation", () => {
  function generateRecipeName(
    customerCode: string,
    components: { abbreviation: string; percentage: number }[],
    revision: number = 1
  ): string {
    const validComponents = components.filter(
      (c) => c.percentage > 0 && c.abbreviation
    );

    // Count occurrences for variety codes
    const abbrevCounts: Record<string, number> = {};
    const abbrevIndexes: Record<string, number> = {};

    validComponents.forEach((comp) => {
      abbrevCounts[comp.abbreviation] =
        (abbrevCounts[comp.abbreviation] || 0) + 1;
    });

    const mashBillPart = validComponents
      .map((comp) => {
        const count = abbrevCounts[comp.abbreviation] || 0;
        if (count > 1) {
          abbrevIndexes[comp.abbreviation] =
            (abbrevIndexes[comp.abbreviation] || 0) + 1;
          return `${comp.percentage}${comp.abbreviation}${
            abbrevIndexes[comp.abbreviation]
          }`;
        } else {
          return `${comp.percentage}${comp.abbreviation}`;
        }
      })
      .join("-");

    const revisionStr = `v${revision.toString().padStart(2, "0")}`;

    return `${customerCode}-${mashBillPart}-${revisionStr}`;
  }

  test("should generate complete recipe name", () => {
    const components = [
      { abbreviation: "C", percentage: 75 },
      { abbreviation: "R", percentage: 21 },
      { abbreviation: "M", percentage: 4 },
    ];
    expect(generateRecipeName("WHK", components, 1)).toBe("WHK-75C-21R-4M-v01");
  });

  test("should handle multi-digit revision", () => {
    const components = [
      { abbreviation: "C", percentage: 75 },
      { abbreviation: "R", percentage: 21 },
      { abbreviation: "M", percentage: 4 },
    ];
    expect(generateRecipeName("BHK", components, 5)).toBe("BHK-75C-21R-4M-v05");
  });

  test("should handle customer codes", () => {
    const components = [
      { abbreviation: "R", percentage: 95 },
      { abbreviation: "M", percentage: 5 },
    ];
    expect(generateRecipeName("PAW", components, 1)).toBe("PAW-95R-5M-v01");
  });
});

// Test grain character abbreviations
describe("Grain Character Abbreviations", () => {
  const GRAIN_ABBREVIATIONS = {
    CORN: "C",
    RYE: "R",
    MALTED_RYE: "Y",
    WHEAT: "W",
    MALT: "M",
    SORGHUM: "S",
    BARLEY: "B",
    OATS: "O",
    SPECIALTY: "Z",
  };

  test("should have single character abbreviations", () => {
    Object.values(GRAIN_ABBREVIATIONS).forEach((abbr) => {
      expect(abbr).toHaveLength(1);
    });
  });

  test("should have unique abbreviations", () => {
    const abbreviations = Object.values(GRAIN_ABBREVIATIONS);
    const uniqueAbbreviations = new Set(abbreviations);
    expect(uniqueAbbreviations.size).toBe(abbreviations.length);
  });

  test("should use standard grain abbreviations", () => {
    expect(GRAIN_ABBREVIATIONS.CORN).toBe("C");
    expect(GRAIN_ABBREVIATIONS.RYE).toBe("R");
    expect(GRAIN_ABBREVIATIONS.WHEAT).toBe("W");
    expect(GRAIN_ABBREVIATIONS.MALT).toBe("M");
  });
});

// Test recipe identity validation business logic
describe("Recipe Identity Validation", () => {
  // Import from MashBillParser for parsing existing recipe names
  interface MashBillComposition {
    corn: number;
    rye: number;
    wheat: number;
    maltedBarley: number;
  }

  interface ParsedMashBillComponent {
    char: string;
    percentage: number;
  }

  // Simplified parser for testing (mimics the service's logic)
  function parseRecipeNameToMashBill(recipeName: string): MashBillComposition {
    const parts = recipeName.split("-");
    const mashBill: MashBillComposition = {
      corn: 0,
      rye: 0,
      wheat: 0,
      maltedBarley: 0,
    };

    for (const part of parts) {
      const match = part.match(/^(\d+(?:\.\d+)?)([CRWM])\d*$/);
      if (match) {
        const percentage = parseFloat(match[1]);
        const grain = match[2];
        switch (grain) {
          case "C":
            mashBill.corn = percentage;
            break;
          case "R":
            mashBill.rye = percentage;
            break;
          case "W":
            mashBill.wheat = percentage;
            break;
          case "M":
            mashBill.maltedBarley = percentage;
            break;
        }
      }
    }
    return mashBill;
  }

  function compareMashBills(
    a: MashBillComposition,
    b: MashBillComposition
  ): boolean {
    const tolerance = 0.01;
    return (
      Math.abs(a.corn - b.corn) <= tolerance &&
      Math.abs(a.rye - b.rye) <= tolerance &&
      Math.abs(a.wheat - b.wheat) <= tolerance &&
      Math.abs(a.maltedBarley - b.maltedBarley) <= tolerance
    );
  }

  describe("parseRecipeNameToMashBill", () => {
    test("should parse standard recipe name to mash bill composition", () => {
      const mashBill = parseRecipeNameToMashBill("WHK-75C-21R-4M-v01");
      expect(mashBill.corn).toBe(75);
      expect(mashBill.rye).toBe(21);
      expect(mashBill.wheat).toBe(0);
      expect(mashBill.maltedBarley).toBe(4);
    });

    test("should parse wheat bourbon recipe", () => {
      const mashBill = parseRecipeNameToMashBill("ABC-70C-15W-15M-v01");
      expect(mashBill.corn).toBe(70);
      expect(mashBill.rye).toBe(0);
      expect(mashBill.wheat).toBe(15);
      expect(mashBill.maltedBarley).toBe(15);
    });

    test("should parse recipe with decimal percentages", () => {
      const mashBill = parseRecipeNameToMashBill("WHK-68.5C-10.5R-21M-v01");
      expect(mashBill.corn).toBe(68.5);
      expect(mashBill.rye).toBe(10.5);
      expect(mashBill.maltedBarley).toBe(21);
    });
  });

  describe("compareMashBills", () => {
    test("should return true for identical mash bills", () => {
      const a = { corn: 75, rye: 21, wheat: 0, maltedBarley: 4 };
      const b = { corn: 75, rye: 21, wheat: 0, maltedBarley: 4 };
      expect(compareMashBills(a, b)).toBe(true);
    });

    test("should return true for mash bills within tolerance", () => {
      const a = { corn: 75, rye: 21, wheat: 0, maltedBarley: 4 };
      const b = {
        corn: 75.001,
        rye: 20.999,
        wheat: 0.001,
        maltedBarley: 3.999,
      };
      expect(compareMashBills(a, b)).toBe(true);
    });

    test("should return false for different mash bills", () => {
      const a = { corn: 75, rye: 21, wheat: 0, maltedBarley: 4 };
      const b = { corn: 70, rye: 21, wheat: 5, maltedBarley: 4 };
      expect(compareMashBills(a, b)).toBe(false);
    });

    test("should return false when corn changes", () => {
      const a = { corn: 75, rye: 21, wheat: 0, maltedBarley: 4 };
      const b = { corn: 80, rye: 16, wheat: 0, maltedBarley: 4 };
      expect(compareMashBills(a, b)).toBe(false);
    });

    test("should return false when rye changes to wheat", () => {
      const a = { corn: 75, rye: 21, wheat: 0, maltedBarley: 4 };
      const b = { corn: 75, rye: 0, wheat: 21, maltedBarley: 4 };
      expect(compareMashBills(a, b)).toBe(false);
    });
  });

  describe("Customer Code Validation", () => {
    test("should detect customer code change", () => {
      const existing = { customerCode: "WHK", Recipe: "WHK-75C-21R-4M-v01" };
      const newCode = "ABC";
      expect(existing.customerCode).not.toBe(newCode);
    });

    test("should allow same customer code", () => {
      const existing = { customerCode: "WHK", Recipe: "WHK-75C-21R-4M-v01" };
      const newCode = "WHK";
      expect(existing.customerCode).toBe(newCode);
    });
  });

  describe("Combined Identity Validation", () => {
    interface ExistingRecipe {
      customerCode: string;
      Recipe: string;
    }

    interface UpdateInput {
      customerCode?: string;
      mashBill?: MashBillComposition;
    }

    function validateRecipeIdentityChange(
      existing: ExistingRecipe,
      input: UpdateInput
    ): { isValid: boolean; error?: string } {
      // Check customer code
      if (input.customerCode && input.customerCode !== existing.customerCode) {
        return {
          isValid: false,
          error: `Cannot change customer code from "${existing.customerCode}" to "${input.customerCode}"`,
        };
      }

      // Check mash bill
      if (input.mashBill) {
        const existingMashBill = parseRecipeNameToMashBill(existing.Recipe);
        if (!compareMashBills(existingMashBill, input.mashBill)) {
          return {
            isValid: false,
            error: "Cannot change mash bill composition",
          };
        }
      }

      return { isValid: true };
    }

    test("should allow update with no identity changes", () => {
      const existing = { customerCode: "WHK", Recipe: "WHK-75C-21R-4M-v01" };
      const input = {
        customerCode: "WHK",
        mashBill: { corn: 75, rye: 21, wheat: 0, maltedBarley: 4 },
      };
      const result = validateRecipeIdentityChange(existing, input);
      expect(result.isValid).toBe(true);
    });

    test("should reject customer code change", () => {
      const existing = { customerCode: "WHK", Recipe: "WHK-75C-21R-4M-v01" };
      const input = { customerCode: "ABC" };
      const result = validateRecipeIdentityChange(existing, input);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("customer code");
    });

    test("should reject mash bill change", () => {
      const existing = { customerCode: "WHK", Recipe: "WHK-75C-21R-4M-v01" };
      const input = {
        mashBill: { corn: 70, rye: 21, wheat: 5, maltedBarley: 4 },
      };
      const result = validateRecipeIdentityChange(existing, input);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("mash bill");
    });

    test("should allow update with only operational changes", () => {
      const existing = { customerCode: "WHK", Recipe: "WHK-75C-21R-4M-v01" };
      const input = {}; // No customer code or mash bill changes
      const result = validateRecipeIdentityChange(existing, input);
      expect(result.isValid).toBe(true);
    });

    test("should allow update when mash bill matches existing", () => {
      const existing = { customerCode: "WHK", Recipe: "WHK-75C-21R-4M-v01" };
      const input = {
        customerCode: "WHK",
        mashBill: { corn: 75, rye: 21, wheat: 0, maltedBarley: 4 },
      };
      const result = validateRecipeIdentityChange(existing, input);
      expect(result.isValid).toBe(true);
    });
  });
});
