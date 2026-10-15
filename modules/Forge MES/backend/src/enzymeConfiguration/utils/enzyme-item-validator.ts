/**
 * Enzyme Item Validator
 *
 * This utility enforces standardized enzyme item number formats and
 * explicitly prevents the use of random identifiers.
 */

export interface EnzymeItemValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface EnzymeItemStandards {
  itemNumber: string;
  erpId: string;
  facilityCode: string;
  sequence: string;
  productName: string;
}

export class EnzymeItemValidator {
  // Regex patterns for validation
  private static readonly ITEM_NUMBER_PATTERN =
    /^ENZ-[A-Z]{3}\d{2}-Enzyme \(.+\)$/;
  private static readonly ERP_ID_PATTERN = /^ENZ-[A-Z]{3}\d{2}-ERP$/;
  private static readonly FACILITY_CODE_PATTERN = /^[A-Z]{3}$/;
  private static readonly SEQUENCE_PATTERN = /^\d{2}$/;

  // Known facility codes
  private static readonly VALID_FACILITY_CODES = ["UNI", "GUS"];

  // Patterns that indicate random generation (FORBIDDEN)
  private static readonly FORBIDDEN_PATTERNS = [
    /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i, // UUID
    /c[a-z0-9]{24}/i, // CUID
    /random/i,
    /uuid/i,
    /guid/i,
    /temp/i,
    /test.*\d{13,}/i, // Timestamp-based test IDs
  ];

  /**
   * Validate enzyme item number format
   */
  static validateItemNumber(itemNumber: string): EnzymeItemValidationResult {
    const result: EnzymeItemValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (!itemNumber) {
      result.errors.push("Item number is required");
      result.isValid = false;
      return result;
    }

    // Check for forbidden random patterns
    for (const pattern of this.FORBIDDEN_PATTERNS) {
      if (pattern.test(itemNumber)) {
        result.errors.push(
          `Item number contains forbidden random pattern: ${itemNumber}`
        );
        result.isValid = false;
      }
    }

    // Check standard format
    if (!this.ITEM_NUMBER_PATTERN.test(itemNumber)) {
      result.errors.push(
        `Item number does not match standard format: ENZ-{FACILITY}{SEQUENCE}-Enzyme ({PRODUCT_NAME})`
      );
      result.isValid = false;
      return result;
    }

    // Parse components
    const parsed = this.parseItemNumber(itemNumber);
    if (!parsed) {
      result.errors.push("Failed to parse item number components");
      result.isValid = false;
      return result;
    }

    // Validate facility code
    if (!this.VALID_FACILITY_CODES.includes(parsed.facilityCode)) {
      result.warnings.push(
        `Facility code '${
          parsed.facilityCode
        }' is not in the standard list: ${this.VALID_FACILITY_CODES.join(", ")}`
      );
    }

    // Validate sequence format
    if (!this.SEQUENCE_PATTERN.test(parsed.sequence)) {
      result.errors.push(
        `Sequence '${parsed.sequence}' must be 2 digits (01, 02, etc.)`
      );
      result.isValid = false;
    }

    // Validate product name
    if (!parsed.productName || parsed.productName.trim().length === 0) {
      result.errors.push("Product name cannot be empty");
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validate ERP ID format
   */
  static validateErpId(erpId: string): EnzymeItemValidationResult {
    const result: EnzymeItemValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (!erpId) {
      result.errors.push("ERP ID is required");
      result.isValid = false;
      return result;
    }

    // Check for forbidden random patterns
    for (const pattern of this.FORBIDDEN_PATTERNS) {
      if (pattern.test(erpId)) {
        result.errors.push(
          `ERP ID contains forbidden random pattern: ${erpId}`
        );
        result.isValid = false;
      }
    }

    // Check standard format
    if (!this.ERP_ID_PATTERN.test(erpId)) {
      result.errors.push(
        `ERP ID does not match standard format: ENZ-{FACILITY}{SEQUENCE}-ERP`
      );
      result.isValid = false;
      return result;
    }

    return result;
  }

  /**
   * Parse item number into components
   */
  static parseItemNumber(itemNumber: string): EnzymeItemStandards | null {
    const match = itemNumber.match(/^ENZ-([A-Z]{3})(\d{2})-Enzyme \((.+)\)$/);
    if (!match) {
      return null;
    }

    const [, facilityCode, sequence, productName] = match;
    const erpId = `ENZ-${facilityCode}${sequence}-ERP`;

    return {
      itemNumber,
      erpId,
      facilityCode,
      sequence,
      productName: productName.trim(),
    };
  }

  /**
   * Generate next item number in sequence for a facility
   */
  static generateNextItemNumber(
    facilityCode: string,
    productName: string,
    existingNumbers: string[]
  ): string {
    if (!this.VALID_FACILITY_CODES.includes(facilityCode)) {
      throw new Error(
        `Invalid facility code: ${facilityCode}. Valid codes: ${this.VALID_FACILITY_CODES.join(
          ", "
        )}`
      );
    }

    // Find existing sequences for this facility
    const existingSequences = existingNumbers
      .map((num) => this.parseItemNumber(num))
      .filter((parsed) => parsed && parsed.facilityCode === facilityCode)
      .map((parsed) => parseInt(parsed!.sequence, 10))
      .sort((a, b) => a - b);

    // Find next available sequence
    let nextSequence = 1;
    for (const seq of existingSequences) {
      if (seq === nextSequence) {
        nextSequence++;
      } else {
        break;
      }
    }

    const sequenceStr = nextSequence.toString().padStart(2, "0");
    return `ENZ-${facilityCode}${sequenceStr}-Enzyme (${productName})`;
  }

  /**
   * Validate that an item number is NOT randomly generated
   */
  static ensureNotRandomlyGenerated(itemNumber: string): void {
    for (const pattern of this.FORBIDDEN_PATTERNS) {
      if (pattern.test(itemNumber)) {
        throw new Error(
          `FORBIDDEN: Item number '${itemNumber}' appears to be randomly generated. ` +
            `All enzyme item numbers must follow the standardized format: ENZ-{FACILITY}{SEQUENCE}-Enzyme ({PRODUCT_NAME})`
        );
      }
    }
  }

  /**
   * Get all current standardized enzyme items
   */
  static getStandardizedEnzymeItems(): EnzymeItemStandards[] {
    return [
      {
        itemNumber: "ENZ-UNI01-Enzyme (Termamyl SC DS)",
        erpId: "ENZ-UNI01-ERP",
        facilityCode: "UNI",
        sequence: "01",
        productName: "Termamyl SC DS",
      },
      {
        itemNumber: "ENZ-UNI02-Enzyme (Saczyme Pro 1.5X)",
        erpId: "ENZ-UNI02-ERP",
        facilityCode: "UNI",
        sequence: "02",
        productName: "Saczyme Pro 1.5X",
      },
      {
        itemNumber: "ENZ-UNI03-Enzyme (Viscoferm)",
        erpId: "ENZ-UNI03-ERP",
        facilityCode: "UNI",
        sequence: "03",
        productName: "Viscoferm",
      },
      {
        itemNumber: "ENZ-UNI04-Enzyme (Liquozyme PRO HP DI)",
        erpId: "ENZ-UNI04-ERP",
        facilityCode: "UNI",
        sequence: "04",
        productName: "Liquozyme PRO HP DI",
      },
      {
        itemNumber: "ENZ-UNI05-Enzyme (Amylex 6T)",
        erpId: "ENZ-UNI05-ERP",
        facilityCode: "UNI",
        sequence: "05",
        productName: "Amylex 6T",
      },
      {
        itemNumber: "ENZ-UNI06-Enzyme (Alphalase THP)",
        erpId: "ENZ-UNI06-ERP",
        facilityCode: "UNI",
        sequence: "06",
        productName: "Alphalase THP",
      },
      {
        itemNumber: "ENZ-UNI07-Enzyme (Saczyme Yield)",
        erpId: "ENZ-UNI07-ERP",
        facilityCode: "UNI",
        sequence: "07",
        productName: "Saczyme Yield",
      },
      {
        itemNumber: "ENZ-UNI08-Enzyme (Diazyme SSF)",
        erpId: "ENZ-UNI08-ERP",
        facilityCode: "UNI",
        sequence: "08",
        productName: "Diazyme SSF",
      },
      {
        itemNumber: "ENZ-GUS01-Enzyme (Laminex C2K)",
        erpId: "ENZ-GUS01-ERP",
        facilityCode: "GUS",
        sequence: "01",
        productName: "Laminex C2K",
      },
      {
        itemNumber: "ENZ-GUS02-Enzyme (Diazyme SSF2)",
        erpId: "ENZ-GUS02-ERP",
        facilityCode: "GUS",
        sequence: "02",
        productName: "Diazyme SSF2",
      },
    ];
  }
}
