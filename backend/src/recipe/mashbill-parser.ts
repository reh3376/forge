/**
 * Mashbill Parser Utility
 *
 * Supports parsing and formatting of recipe mashbill strings in both legacy and new formats:
 * - Legacy: WHK-75-21-00-04-v01 (fixed 4-grain format: Corn-Rye-Wheat-Malt)
 * - New: WHK-68.5C-10.5R-21M-v01 (flexible grain abbreviations with varieties)
 *
 * Based on TEC-282 Recipe String Format Specification
 */

export interface MashBillComponent {
  /** Grain abbreviation (C, R, W, M, Y, S, B, O, Z) */
  char: string;
  /** Optional variety code (1, 2, 3, etc.) for R1, R2, C1, C2, etc. */
  variety?: string;
  /** Percentage of this grain in the mashbill (supports decimals) */
  percentage: number;
  /** Optional display name for the grain */
  grainName?: string;
}

export interface ParsedMashBill {
  /** Customer code (e.g., WHK, ABC) */
  customerCode: string;
  /** Parsed mashbill components */
  components: MashBillComponent[];
  /** Revision number (e.g., 1, 2, 10) */
  revision: number;
  /** Format detected: 'new' or 'legacy' */
  format: "new" | "legacy";
  /** Total percentage (should be ~100) */
  totalPercentage: number;
  /** Whether the mashbill is valid (percentages sum to ~100) */
  isValid: boolean;
}

export interface MashBillValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  totalPercentage: number;
}

/**
 * Grain abbreviation mappings for new format
 */
export const GRAIN_ABBREVIATIONS = {
  C: "Corn",
  R: "Rye",
  Y: "Malted Rye",
  W: "Wheat",
  M: "Malt",
  S: "Specialty",
  B: "Buckwheat",
  O: "Oats",
  Z: "Zinfandel",
} as const;

/**
 * Legacy grain order: Corn, Rye, Wheat, Malt
 */
const LEGACY_GRAIN_ORDER = ["Corn", "Rye", "Wheat", "Malt"] as const;

export class MashBillParser {
  /**
   * Detect format of recipe string
   *
   * @param recipeString - Full recipe string (e.g., "WHK-68.5C-10.5R-21M-v01")
   * @returns 'new', 'legacy', or 'unknown'
   */
  static detectFormat(recipeString: string): "new" | "legacy" | "unknown" {
    if (!recipeString || typeof recipeString !== "string") {
      return "unknown";
    }

    const parts = recipeString.split("-");

    // Must have at least customer code, mashbill, and revision
    if (parts.length < 3) {
      return "unknown";
    }

    // Check if contains letter suffixes (new format)
    // New format pattern: digits followed by letter, possibly followed by digits (variety)
    const newFormatPattern = /\d+(?:\.\d+)?[A-Z]\d*/;
    const hasLetterSuffixes = parts.some(
      (part, i) => i > 0 && i < parts.length - 1 && newFormatPattern.test(part)
    );

    if (hasLetterSuffixes) {
      return "new";
    }

    // Check for legacy format: all numeric parts between customer code and revision
    const middleParts = parts.slice(1, parts.length - 1);
    const allNumeric = middleParts.every((part) => /^\d+$/.test(part));

    if (allNumeric && middleParts.length === 4) {
      return "legacy";
    }

    return "unknown";
  }

  /**
   * Parse recipe string (auto-detects format)
   *
   * @param recipeString - Full recipe string
   * @returns Parsed mashbill data
   */
  static parse(recipeString: string): ParsedMashBill {
    const format = this.detectFormat(recipeString);

    if (format === "new") {
      return this.parseNewFormat(recipeString);
    } else if (format === "legacy") {
      return this.parseLegacyFormat(recipeString);
    } else {
      throw new Error(`Unable to parse recipe string: ${recipeString}`);
    }
  }

  /**
   * Parse new format recipe string
   * Format: WHK-68.5C-10.5R-21M-v01
   *
   * @param recipeString - Recipe string in new format
   * @returns Parsed mashbill data
   */
  static parseNewFormat(recipeString: string): ParsedMashBill {
    const parts = recipeString.split("-");

    if (parts.length < 3) {
      throw new Error(`Invalid recipe string format: ${recipeString}`);
    }

    const customerCode = parts[0];
    const revisionPart = parts[parts.length - 1];
    const mashbillParts = parts.slice(1, parts.length - 1);

    // Parse revision (v01 -> 1, v10 -> 10; also accepts legacy R01 format)
    const revisionMatch = revisionPart.match(/^[Rv](\d+)$/);
    if (!revisionMatch) {
      throw new Error(`Invalid revision format: ${revisionPart}`);
    }
    const revision = parseInt(revisionMatch[1], 10);

    // Parse mashbill components
    const components: MashBillComponent[] = [];
    const componentPattern = /^(\d+(?:\.\d+)?)([A-Z])(\d*)$/;

    for (const part of mashbillParts) {
      const match = part.match(componentPattern);
      if (!match) {
        throw new Error(`Invalid mashbill component: ${part}`);
      }

      const [, percentageStr, char, varietyCode] = match;
      const percentage = parseFloat(percentageStr);

      if (isNaN(percentage) || percentage < 0 || percentage > 100) {
        throw new Error(
          `Invalid percentage: ${percentageStr} in component ${part}`
        );
      }

      components.push({
        char,
        variety: varietyCode || undefined,
        percentage,
        grainName:
          GRAIN_ABBREVIATIONS[char as keyof typeof GRAIN_ABBREVIATIONS],
      });
    }

    const totalPercentage = components.reduce(
      (sum, c) => sum + c.percentage,
      0
    );
    const isValid = Math.abs(totalPercentage - 100) < 0.01; // Allow floating point tolerance

    return {
      customerCode,
      components,
      revision,
      format: "new",
      totalPercentage,
      isValid,
    };
  }

  /**
   * Parse legacy format recipe string
   * Format: WHK-75-21-00-04-v01 (Corn-Rye-Wheat-Malt)
   *
   * @param recipeString - Recipe string in legacy format
   * @returns Parsed mashbill data
   */
  static parseLegacyFormat(recipeString: string): ParsedMashBill {
    const parts = recipeString.split("-");

    if (parts.length !== 6) {
      throw new Error(`Invalid legacy recipe string format: ${recipeString}`);
    }

    const customerCode = parts[0];
    const [cornStr, ryeStr, wheatStr, maltStr] = parts.slice(1, 5);
    const revisionPart = parts[5];

    // Parse revision (accepts both v## and legacy R## formats)
    const revisionMatch = revisionPart.match(/^[Rv](\d+)$/);
    if (!revisionMatch) {
      throw new Error(`Invalid revision format: ${revisionPart}`);
    }
    const revision = parseInt(revisionMatch[1], 10);

    // Parse grain percentages
    const corn = parseInt(cornStr, 10);
    const rye = parseInt(ryeStr, 10);
    const wheat = parseInt(wheatStr, 10);
    const malt = parseInt(maltStr, 10);

    // Create components (skip 0% grains)
    const components: MashBillComponent[] = [];
    const legacyMapping = [
      { percentage: corn, char: "C", name: "Corn" },
      { percentage: rye, char: "R", name: "Rye" },
      { percentage: wheat, char: "W", name: "Wheat" },
      { percentage: malt, char: "M", name: "Malt" },
    ];

    for (const { percentage, char, name } of legacyMapping) {
      if (percentage > 0) {
        components.push({
          char,
          percentage,
          grainName: name,
        });
      }
    }

    const totalPercentage = corn + rye + wheat + malt;
    const isValid = totalPercentage === 100;

    return {
      customerCode,
      components,
      revision,
      format: "legacy",
      totalPercentage,
      isValid,
    };
  }

  /**
   * Convert legacy format to new format
   *
   * @param recipeString - Legacy recipe string (e.g., "WHK-75-21-00-04-v01")
   * @returns New format recipe string (e.g., "WHK-75C-21R-4M-v01")
   */
  static convertLegacyToNew(recipeString: string): string {
    const parsed = this.parseLegacyFormat(recipeString);
    return this.formatRecipeString(
      parsed.customerCode,
      parsed.components,
      parsed.revision
    );
  }

  /**
   * Format recipe string from components
   *
   * @param customerCode - Customer code (e.g., "WHK")
   * @param components - Mashbill components
   * @param revision - Revision number
   * @returns Formatted recipe string (e.g., "WHK-68.5C-10.5R-21M-v01")
   */
  static formatRecipeString(
    customerCode: string,
    components: MashBillComponent[],
    revision: number
  ): string {
    const mashbillParts = components.map((c) => {
      const percentage =
        c.percentage % 1 === 0
          ? c.percentage.toString()
          : c.percentage.toFixed(1);
      const variety = c.variety || "";
      return `${percentage}${c.char}${variety}`;
    });

    const revisionStr = `v${revision.toString().padStart(2, "0")}`;

    return [customerCode, ...mashbillParts, revisionStr].join("-");
  }

  /**
   * Format just the mashbill portion (without customer code and revision)
   *
   * @param components - Mashbill components
   * @returns Mashbill string (e.g., "68.5C-10.5R-21M")
   */
  static formatMashBillString(components: MashBillComponent[]): string {
    return components
      .map((c) => {
        const percentage =
          c.percentage % 1 === 0
            ? c.percentage.toString()
            : c.percentage.toFixed(1);
        const variety = c.variety || "";
        return `${percentage}${c.char}${variety}`;
      })
      .join("-");
  }

  /**
   * Validate mashbill components
   *
   * @param components - Mashbill components to validate
   * @returns Validation result with errors and warnings
   */
  static validate(components: MashBillComponent[]): MashBillValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!components || components.length === 0) {
      errors.push("Mashbill must contain at least one grain component");
      return { isValid: false, errors, warnings, totalPercentage: 0 };
    }

    // Validate individual components
    for (const component of components) {
      if (!component.char || typeof component.char !== "string") {
        errors.push(`Invalid grain character: ${component.char}`);
      }

      if (
        typeof component.percentage !== "number" ||
        isNaN(component.percentage)
      ) {
        errors.push(
          `Invalid percentage for ${component.char}: ${component.percentage}`
        );
      } else if (component.percentage < 0 || component.percentage > 100) {
        errors.push(
          `Percentage out of range for ${component.char}: ${component.percentage}`
        );
      } else if (component.percentage === 0) {
        warnings.push(
          `Zero percentage for ${component.char} - consider removing this component`
        );
      }

      if (component.variety && !/^\d+$/.test(component.variety)) {
        errors.push(
          `Invalid variety code for ${component.char}: ${component.variety}`
        );
      }
    }

    // Validate total percentage
    const totalPercentage = components.reduce(
      (sum, c) => sum + c.percentage,
      0
    );
    const tolerance = 0.01; // Allow 0.01% tolerance for floating point

    if (Math.abs(totalPercentage - 100) > tolerance) {
      errors.push(
        `Mashbill percentages must sum to 100% (currently ${totalPercentage.toFixed(
          2
        )}%)`
      );
    }

    // Check for duplicate grain/variety combinations
    const seen = new Set<string>();
    for (const component of components) {
      const key = `${component.char}${component.variety || ""}`;
      if (seen.has(key)) {
        errors.push(`Duplicate grain/variety combination: ${key}`);
      }
      seen.add(key);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      totalPercentage,
    };
  }

  /**
   * Extract mashbill string from full recipe string
   *
   * @param recipeString - Full recipe string
   * @returns Mashbill portion only (e.g., "68.5C-10.5R-21M")
   */
  static extractMashBillString(recipeString: string): string {
    const parts = recipeString.split("-");
    if (parts.length < 3) {
      throw new Error(`Invalid recipe string: ${recipeString}`);
    }

    // Remove customer code (first) and revision (last)
    return parts.slice(1, parts.length - 1).join("-");
  }

  /**
   * Sort components by percentage (descending) and group varieties
   *
   * @param components - Components to sort
   * @returns Sorted components
   */
  static sortComponents(components: MashBillComponent[]): MashBillComponent[] {
    return [...components].sort((a, b) => {
      // First sort by percentage (descending)
      if (b.percentage !== a.percentage) {
        return b.percentage - a.percentage;
      }

      // Then by grain char (alphabetically)
      if (a.char !== b.char) {
        return a.char.localeCompare(b.char);
      }

      // Then by variety (numerically)
      const aVar = parseInt(a.variety || "0", 10);
      const bVar = parseInt(b.variety || "0", 10);
      return aVar - bVar;
    });
  }
}
