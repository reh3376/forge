import { EnzymeItemValidator } from "../enzyme-item-validator";

describe("EnzymeItemValidator", () => {
  describe("validateItemNumber", () => {
    it("should validate correct enzyme item numbers", () => {
      const validNumbers = [
        "ENZ-UNI01-Enzyme (Termamyl SC DS)",
        "ENZ-UNI02-Enzyme (Saczyme Pro 1.5X)",
        "ENZ-GUS01-Enzyme (Laminex C2K)",
        "ENZ-ABC99-Enzyme (Test Enzyme)",
      ];

      validNumbers.forEach((itemNumber) => {
        const result = EnzymeItemValidator.validateItemNumber(itemNumber);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it("should reject random/UUID patterns", () => {
      const randomNumbers = [
        "ENZ-550e8400-e29b-41d4-a716-446655440000", // UUID
        "ENZ-c123456789012345678901234", // CUID
        "ENZ-random-123",
        "ENZ-uuid-456",
        "ENZ-temp-789",
        "ENZ-test-1234567890123", // Timestamp-like
      ];

      randomNumbers.forEach((itemNumber) => {
        const result = EnzymeItemValidator.validateItemNumber(itemNumber);
        expect(result.isValid).toBe(false);
        expect(
          result.errors.some((error) =>
            error.includes("forbidden random pattern")
          )
        ).toBe(true);
      });
    });

    it("should reject invalid formats", () => {
      const invalidNumbers = [
        "ENZYME-UNI01-Test", // Wrong prefix
        "ENZ-UNI1-Enzyme (Test)", // Wrong sequence format
        "ENZ-UNII01-Enzyme (Test)", // Wrong facility format
        "ENZ-UNI01-Test (Test)", // Wrong middle part
        "ENZ-UNI01-Enzyme Test", // Missing parentheses
        "ENZ-UNI01-Enzyme ()", // Empty product name
        "",
      ];

      invalidNumbers.forEach((itemNumber) => {
        const result = EnzymeItemValidator.validateItemNumber(itemNumber);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    it("should warn about non-standard facility codes", () => {
      const result = EnzymeItemValidator.validateItemNumber(
        "ENZ-XYZ01-Enzyme (Test)"
      );
      expect(result.isValid).toBe(true);
      expect(
        result.warnings.some((warning) =>
          warning.includes("not in the standard list")
        )
      ).toBe(true);
    });
  });

  describe("validateErpId", () => {
    it("should validate correct ERP IDs", () => {
      const validErpIds = ["ENZ-UNI01-ERP", "ENZ-GUS02-ERP", "ENZ-ABC99-ERP"];

      validErpIds.forEach((erpId) => {
        const result = EnzymeItemValidator.validateErpId(erpId);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it("should reject random patterns in ERP IDs", () => {
      const randomErpIds = [
        "550e8400-e29b-41d4-a716-446655440000",
        "c123456789012345678901234",
        "random-erp-id",
        "uuid-based-id",
      ];

      randomErpIds.forEach((erpId) => {
        const result = EnzymeItemValidator.validateErpId(erpId);
        expect(result.isValid).toBe(false);
        expect(
          result.errors.some((error) =>
            error.includes("forbidden random pattern")
          )
        ).toBe(true);
      });
    });

    it("should reject invalid ERP ID formats", () => {
      const invalidErpIds = [
        "ENZ-UNI1-ERP", // Wrong sequence format
        "ENZ-UNII01-ERP", // Wrong facility format
        "ENZ-UNI01-ID", // Wrong suffix
        "ENZYME-UNI01-ERP", // Wrong prefix
        "",
      ];

      invalidErpIds.forEach((erpId) => {
        const result = EnzymeItemValidator.validateErpId(erpId);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe("parseItemNumber", () => {
    it("should parse valid item numbers correctly", () => {
      const itemNumber = "ENZ-UNI01-Enzyme (Termamyl SC DS)";
      const parsed = EnzymeItemValidator.parseItemNumber(itemNumber);

      expect(parsed).not.toBeNull();
      expect(parsed!.itemNumber).toBe(itemNumber);
      expect(parsed!.erpId).toBe("ENZ-UNI01-ERP");
      expect(parsed!.facilityCode).toBe("UNI");
      expect(parsed!.sequence).toBe("01");
      expect(parsed!.productName).toBe("Termamyl SC DS");
    });

    it("should return null for invalid formats", () => {
      const invalidNumbers = [
        "invalid-format",
        "ENZ-UNI1-Enzyme (Test)", // Wrong sequence
        "ENZ-UNI01-Test (Test)", // Wrong middle part
      ];

      invalidNumbers.forEach((itemNumber) => {
        const parsed = EnzymeItemValidator.parseItemNumber(itemNumber);
        expect(parsed).toBeNull();
      });
    });
  });

  describe("generateNextItemNumber", () => {
    it("should generate next sequential item number", () => {
      const existingNumbers = [
        "ENZ-UNI01-Enzyme (Test 1)",
        "ENZ-UNI02-Enzyme (Test 2)",
        "ENZ-GUS01-Enzyme (Test 3)",
      ];

      const nextUni = EnzymeItemValidator.generateNextItemNumber(
        "UNI",
        "New Enzyme",
        existingNumbers
      );
      expect(nextUni).toBe("ENZ-UNI03-Enzyme (New Enzyme)");

      const nextGus = EnzymeItemValidator.generateNextItemNumber(
        "GUS",
        "Another Enzyme",
        existingNumbers
      );
      expect(nextGus).toBe("ENZ-GUS02-Enzyme (Another Enzyme)");
    });

    it("should fill gaps in sequence", () => {
      const existingNumbers = [
        "ENZ-UNI01-Enzyme (Test 1)",
        "ENZ-UNI03-Enzyme (Test 3)", // Gap at 02
      ];

      const next = EnzymeItemValidator.generateNextItemNumber(
        "UNI",
        "Gap Filler",
        existingNumbers
      );
      expect(next).toBe("ENZ-UNI02-Enzyme (Gap Filler)");
    });

    it("should reject invalid facility codes", () => {
      expect(() => {
        EnzymeItemValidator.generateNextItemNumber("INVALID", "Test", []);
      }).toThrow("Invalid facility code");
    });
  });

  describe("ensureNotRandomlyGenerated", () => {
    it("should pass for valid standardized item numbers", () => {
      const validNumbers = [
        "ENZ-UNI01-Enzyme (Termamyl SC DS)",
        "ENZ-GUS02-Enzyme (Diazyme SSF2)",
      ];

      validNumbers.forEach((itemNumber) => {
        expect(() => {
          EnzymeItemValidator.ensureNotRandomlyGenerated(itemNumber);
        }).not.toThrow();
      });
    });

    it("should throw for random patterns", () => {
      const randomNumbers = [
        "550e8400-e29b-41d4-a716-446655440000",
        "c123456789012345678901234",
        "random-item-123",
        "uuid-based-item",
        "temp-item-456",
      ];

      randomNumbers.forEach((itemNumber) => {
        expect(() => {
          EnzymeItemValidator.ensureNotRandomlyGenerated(itemNumber);
        }).toThrow("FORBIDDEN");
      });
    });
  });

  describe("getStandardizedEnzymeItems", () => {
    it("should return all current standardized enzyme items", () => {
      const items = EnzymeItemValidator.getStandardizedEnzymeItems();

      expect(items).toHaveLength(10);

      // Check a few specific items
      const termamyl = items.find(
        (item) => item.productName === "Termamyl SC DS"
      );
      expect(termamyl).toBeDefined();
      expect(termamyl!.itemNumber).toBe("ENZ-UNI01-Enzyme (Termamyl SC DS)");
      expect(termamyl!.erpId).toBe("ENZ-UNI01-ERP");
      expect(termamyl!.facilityCode).toBe("UNI");
      expect(termamyl!.sequence).toBe("01");

      const laminex = items.find((item) => item.productName === "Laminex C2K");
      expect(laminex).toBeDefined();
      expect(laminex!.itemNumber).toBe("ENZ-GUS01-Enzyme (Laminex C2K)");
      expect(laminex!.erpId).toBe("ENZ-GUS01-ERP");
      expect(laminex!.facilityCode).toBe("GUS");
      expect(laminex!.sequence).toBe("01");
    });

    it("should have all items follow the standard format", () => {
      const items = EnzymeItemValidator.getStandardizedEnzymeItems();

      items.forEach((item) => {
        const itemValidation = EnzymeItemValidator.validateItemNumber(
          item.itemNumber
        );
        const erpValidation = EnzymeItemValidator.validateErpId(item.erpId);

        expect(itemValidation.isValid).toBe(true);
        expect(erpValidation.isValid).toBe(true);

        // Ensure no random patterns
        expect(() => {
          EnzymeItemValidator.ensureNotRandomlyGenerated(item.itemNumber);
          EnzymeItemValidator.ensureNotRandomlyGenerated(item.erpId);
        }).not.toThrow();
      });
    });
  });
});
