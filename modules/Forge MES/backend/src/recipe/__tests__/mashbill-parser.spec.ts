import { MashBillParser, GRAIN_ABBREVIATIONS } from "../mashbill-parser";

describe("MashBillParser", () => {
  describe("detectFormat", () => {
    it("should detect new format with letter suffixes", () => {
      expect(MashBillParser.detectFormat("WHK-68.5C-10.5R-21M-v01")).toBe(
        "new"
      );
      expect(MashBillParser.detectFormat("ABC-75C-21R-4M-v01")).toBe("new");
      expect(MashBillParser.detectFormat("WHK-51C-30R1-15R2-4M-v01")).toBe(
        "new"
      );
    });

    it("should detect legacy format with numeric parts", () => {
      expect(MashBillParser.detectFormat("WHK-75-21-00-04-v01")).toBe("legacy");
      expect(MashBillParser.detectFormat("ABC-68-11-00-21-v01")).toBe("legacy");
      expect(MashBillParser.detectFormat("WHK-51-30-15-04-v01")).toBe("legacy");
    });

    it("should return unknown for invalid formats", () => {
      expect(MashBillParser.detectFormat("")).toBe("unknown");
      expect(MashBillParser.detectFormat("invalid")).toBe("unknown");
      expect(MashBillParser.detectFormat("WHK-v01")).toBe("unknown");
    });

    it("should handle null/undefined inputs", () => {
      expect(MashBillParser.detectFormat(null as any)).toBe("unknown");
      expect(MashBillParser.detectFormat(undefined as any)).toBe("unknown");
    });
  });

  describe("parse - New Format", () => {
    it("should parse standard new format recipe", () => {
      const result = MashBillParser.parse("WHK-68.5C-10.5R-21M-v01");

      expect(result.customerCode).toBe("WHK");
      expect(result.format).toBe("new");
      expect(result.revision).toBe(1);
      expect(result.components).toHaveLength(3);
      expect(result.totalPercentage).toBe(100);
      expect(result.isValid).toBe(true);

      expect(result.components[0]).toEqual({
        char: "C",
        percentage: 68.5,
        grainName: "Corn",
      });
      expect(result.components[1]).toEqual({
        char: "R",
        percentage: 10.5,
        grainName: "Rye",
      });
      expect(result.components[2]).toEqual({
        char: "M",
        percentage: 21,
        grainName: "Malt",
      });
    });

    it("should parse recipe with variety codes", () => {
      const result = MashBillParser.parse("WHK-51C-30R1-15R2-4M-v01");

      expect(result.components).toHaveLength(4);
      expect(result.components[1]).toEqual({
        char: "R",
        variety: "1",
        percentage: 30,
        grainName: "Rye",
      });
      expect(result.components[2]).toEqual({
        char: "R",
        variety: "2",
        percentage: 15,
        grainName: "Rye",
      });
    });

    it("should parse recipe with all grain types", () => {
      const result = MashBillParser.parse("WHK-25C-25R-25W-25M-v01");

      expect(result.components).toHaveLength(4);
      expect(result.totalPercentage).toBe(100);
      expect(result.components.map((c) => c.char)).toEqual([
        "C",
        "R",
        "W",
        "M",
      ]);
    });

    it("should parse recipe with specialty grains", () => {
      const result = MashBillParser.parse("WHK-50C-20Y-20S-10M-v01");

      expect(result.components).toHaveLength(4);
      expect(result.components[1].char).toBe("Y");
      expect(result.components[1].grainName).toBe("Malted Rye");
      expect(result.components[2].char).toBe("S");
      expect(result.components[2].grainName).toBe("Specialty");
    });

    it("should handle higher revision numbers", () => {
      const result = MashBillParser.parse("WHK-75C-21R-4M-v10");
      expect(result.revision).toBe(10);

      const result2 = MashBillParser.parse("WHK-75C-21R-4M-v02");
      expect(result2.revision).toBe(2);
    });
  });

  describe("parse - Legacy Format", () => {
    it("should parse standard legacy format recipe", () => {
      const result = MashBillParser.parse("WHK-75-21-00-04-v01");

      expect(result.customerCode).toBe("WHK");
      expect(result.format).toBe("legacy");
      expect(result.revision).toBe(1);
      expect(result.components).toHaveLength(3); // Only non-zero grains
      expect(result.totalPercentage).toBe(100);
      expect(result.isValid).toBe(true);

      expect(result.components[0]).toEqual({
        char: "C",
        percentage: 75,
        grainName: "Corn",
      });
      expect(result.components[1]).toEqual({
        char: "R",
        percentage: 21,
        grainName: "Rye",
      });
      expect(result.components[2]).toEqual({
        char: "M",
        percentage: 4,
        grainName: "Malt",
      });
    });

    it("should parse legacy format with all four grains", () => {
      const result = MashBillParser.parse("WHK-51-30-15-04-v01");

      expect(result.components).toHaveLength(4);
      expect(result.totalPercentage).toBe(100);

      expect(result.components[0].char).toBe("C");
      expect(result.components[1].char).toBe("R");
      expect(result.components[2].char).toBe("W");
      expect(result.components[3].char).toBe("M");
    });

    it("should handle wheated bourbon (no rye)", () => {
      const result = MashBillParser.parse("WHK-70-00-22-08-v01");

      expect(result.components).toHaveLength(3); // Corn, Wheat, Malt
      expect(result.components.find((c) => c.char === "R")).toBeUndefined();
      expect(result.components.find((c) => c.char === "W")?.percentage).toBe(
        22
      );
    });
  });

  describe("convertLegacyToNew", () => {
    it("should convert legacy format to new format", () => {
      expect(MashBillParser.convertLegacyToNew("WHK-75-21-00-04-v01")).toBe(
        "WHK-75C-21R-4M-v01"
      );
      expect(MashBillParser.convertLegacyToNew("ABC-68-11-00-21-v01")).toBe(
        "ABC-68C-11R-21M-v01"
      );
    });

    it("should handle four grain recipes", () => {
      expect(MashBillParser.convertLegacyToNew("WHK-51-30-15-04-v01")).toBe(
        "WHK-51C-30R-15W-4M-v01"
      );
    });

    it("should handle wheated bourbon", () => {
      expect(MashBillParser.convertLegacyToNew("WHK-70-00-22-08-v01")).toBe(
        "WHK-70C-22W-8M-v01"
      );
    });

    it("should preserve higher revision numbers", () => {
      expect(MashBillParser.convertLegacyToNew("WHK-75-21-00-04-v05")).toBe(
        "WHK-75C-21R-4M-v05"
      );
    });

    it("should throw for already-new format", () => {
      const newFormat = "WHK-75C-21R-4M-v01";
      expect(() => MashBillParser.convertLegacyToNew(newFormat)).toThrow(
        "Invalid legacy recipe string format"
      );
    });
  });

  describe("formatRecipeString", () => {
    it("should format components into recipe string", () => {
      const components = [
        { char: "C", percentage: 75 },
        { char: "R", percentage: 21 },
        { char: "M", percentage: 4 },
      ];

      const result = MashBillParser.formatRecipeString("WHK", components, 1);
      expect(result).toBe("WHK-75C-21R-4M-v01");
    });

    it("should format with variety codes", () => {
      const components = [
        { char: "C", percentage: 51 },
        { char: "R", variety: "1", percentage: 30 },
        { char: "R", variety: "2", percentage: 15 },
        { char: "M", percentage: 4 },
      ];

      const result = MashBillParser.formatRecipeString("WHK", components, 1);
      expect(result).toBe("WHK-51C-30R1-15R2-4M-v01");
    });

    it("should handle decimal percentages", () => {
      const components = [
        { char: "C", percentage: 68.5 },
        { char: "R", percentage: 10.5 },
        { char: "M", percentage: 21 },
      ];

      const result = MashBillParser.formatRecipeString("WHK", components, 1);
      expect(result).toBe("WHK-68.5C-10.5R-21M-v01");
    });

    it("should handle double-digit revisions", () => {
      const components = [{ char: "C", percentage: 100 }];
      const result = MashBillParser.formatRecipeString("WHK", components, 10);
      expect(result).toBe("WHK-100C-v10");
    });
  });

  describe("validate", () => {
    it("should validate correct components", () => {
      const parsed = MashBillParser.parse("WHK-75C-21R-4M-v01");
      const result = MashBillParser.validate(parsed.components);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.totalPercentage).toBe(100);
    });

    it("should report error when percentages do not sum to 100", () => {
      const parsed = MashBillParser.parse("WHK-50C-20R-10M-v01");
      const result = MashBillParser.validate(parsed.components);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("80"))).toBe(true);
      expect(result.totalPercentage).toBe(80);
    });

    it("should report error for percentages over 100", () => {
      const parsed = MashBillParser.parse("WHK-75C-21R-4.5M-v01");
      const result = MashBillParser.validate(parsed.components);

      expect(result.isValid).toBe(false);
      expect(result.totalPercentage).toBeCloseTo(100.5);
    });

    it("should report error for duplicate grain without variety", () => {
      const parsed = MashBillParser.parse("WHK-50C-30R-20R-v01");
      const result = MashBillParser.validate(parsed.components);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
    });

    it("should allow duplicate grains with different varieties", () => {
      const parsed = MashBillParser.parse("WHK-51C-30R1-15R2-4M-v01");
      const result = MashBillParser.validate(parsed.components);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate components with unknown abbreviation but warn", () => {
      const components = [
        { char: "X", percentage: 75 },
        { char: "R", percentage: 21 },
        { char: "M", percentage: 4 },
      ];
      const result = MashBillParser.validate(components);

      // Validates successfully if total is 100, warnings are separate
      expect(result.totalPercentage).toBe(100);
    });
  });

  describe("sortComponents", () => {
    it("should sort components by percentage descending", () => {
      const components = [
        { char: "M", percentage: 4 },
        { char: "C", percentage: 75 },
        { char: "R", percentage: 21 },
      ];

      const sorted = MashBillParser.sortComponents(components);

      expect(sorted[0].char).toBe("C");
      expect(sorted[0].percentage).toBe(75);
      expect(sorted[1].char).toBe("R");
      expect(sorted[1].percentage).toBe(21);
      expect(sorted[2].char).toBe("M");
      expect(sorted[2].percentage).toBe(4);
    });

    it("should not mutate original array", () => {
      const components = [
        { char: "M", percentage: 4 },
        { char: "C", percentage: 75 },
      ];

      const sorted = MashBillParser.sortComponents(components);

      expect(components[0].char).toBe("M");
      expect(sorted[0].char).toBe("C");
    });
  });

  describe("GRAIN_ABBREVIATIONS", () => {
    it("should have all expected grain types", () => {
      expect(GRAIN_ABBREVIATIONS.C).toBe("Corn");
      expect(GRAIN_ABBREVIATIONS.R).toBe("Rye");
      expect(GRAIN_ABBREVIATIONS.Y).toBe("Malted Rye");
      expect(GRAIN_ABBREVIATIONS.W).toBe("Wheat");
      expect(GRAIN_ABBREVIATIONS.M).toBe("Malt");
      expect(GRAIN_ABBREVIATIONS.S).toBe("Specialty");
      expect(GRAIN_ABBREVIATIONS.B).toBe("Buckwheat");
      expect(GRAIN_ABBREVIATIONS.O).toBe("Oats");
      expect(GRAIN_ABBREVIATIONS.Z).toBe("Zinfandel");
    });
  });

  describe("Edge Cases", () => {
    it("should handle recipe with only one grain", () => {
      const result = MashBillParser.parse("WHK-100C-v01");

      expect(result.components).toHaveLength(1);
      expect(result.components[0].percentage).toBe(100);
      expect(result.isValid).toBe(true);
    });

    it("should handle very small percentages", () => {
      const result = MashBillParser.parse("WHK-96C-3.5R-0.5M-v01");

      expect(result.components).toHaveLength(3);
      expect(result.totalPercentage).toBe(100);
      expect(result.components[2].percentage).toBe(0.5);
    });

    it("should handle different customer codes", () => {
      const result1 = MashBillParser.parse("ABC-75C-21R-4M-v01");
      const result2 = MashBillParser.parse("CUST123-75C-21R-4M-v01");

      expect(result1.customerCode).toBe("ABC");
      expect(result2.customerCode).toBe("CUST123");
    });
  });
});
