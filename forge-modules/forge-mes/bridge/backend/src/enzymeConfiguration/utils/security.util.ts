import { BadRequestException } from "@nestjs/common";

/**
 * Security utility functions for input sanitization and validation
 */
export class SecurityUtil {
  /**
   * Sanitize string input to prevent injection attacks
   * @param input - The input string to sanitize
   * @param maxLength - Maximum allowed length (default: 1000)
   * @returns Sanitized string
   */
  static sanitizeString(input: string, maxLength: number = 1000): string {
    if (!input || typeof input !== "string") {
      return "";
    }

    // Remove potentially dangerous characters and patterns
    let sanitized = input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remove script tags
      .replace(/<[^>]*>/g, "") // Remove HTML tags
      .replace(/javascript:/gi, "") // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, "") // Remove event handlers
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1F\x7F]/g, "") // Remove control characters
      .trim();

    // Limit length
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  /**
   * Validate and sanitize numeric input
   * @param input - The numeric input to validate
   * @param min - Minimum allowed value
   * @param max - Maximum allowed value
   * @returns Validated number
   */
  static validateNumber(input: any, min?: number, max?: number): number {
    const num = Number(input);

    if (isNaN(num) || !isFinite(num)) {
      throw new BadRequestException("Invalid numeric value provided");
    }

    if (min !== undefined && num < min) {
      throw new BadRequestException(`Value must be at least ${min}`);
    }

    if (max !== undefined && num > max) {
      throw new BadRequestException(`Value must not exceed ${max}`);
    }

    return num;
  }

  /**
   * Validate CUID format
   * @param id - The ID to validate
   * @returns boolean indicating if the ID is valid
   */
  static isValidCUID(id: string): boolean {
    if (!id || typeof id !== "string") {
      return false;
    }

    // CUID format: c + timestamp (8 chars) + counter (4 chars) + fingerprint (4 chars) + random (8 chars)
    // Total length: 25 characters, starts with 'c'
    const cuidRegex = /^c[a-z0-9]{24}$/;
    return cuidRegex.test(id);
  }

  /**
   * Sanitize and validate user ID
   * @param userId - The user ID to validate
   * @returns Sanitized user ID
   */
  static validateUserId(userId: string): string {
    if (!userId || typeof userId !== "string") {
      throw new BadRequestException("User ID is required");
    }

    const sanitized = this.sanitizeString(userId, 100);

    if (sanitized.length === 0) {
      throw new BadRequestException("Invalid user ID format");
    }

    return sanitized;
  }

  /**
   * Validate enum value
   * @param value - The value to validate
   * @param enumObject - The enum object to validate against
   * @param fieldName - Name of the field for error messages
   * @returns The validated enum value
   */
  static validateEnum<T>(
    value: any,
    enumObject: Record<string, T>,
    fieldName: string
  ): T {
    if (!value) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    const enumValues = Object.values(enumObject);
    if (!enumValues.includes(value)) {
      throw new BadRequestException(
        `Invalid ${fieldName}. Allowed values: ${enumValues.join(", ")}`
      );
    }

    return value;
  }

  /**
   * Sanitize instructions text with additional validation
   * @param instructions - The instructions text to sanitize
   * @returns Sanitized instructions
   */
  static sanitizeInstructions(instructions: string): string {
    if (!instructions || typeof instructions !== "string") {
      return "";
    }

    // Allow basic formatting but remove dangerous content
    let sanitized = instructions
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/javascript:/gi, "")
      .replace(/on\w+\s*=/gi, "")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove most control chars but keep \n, \r, \t
      .trim();

    // Limit length for instructions
    if (sanitized.length > 5000) {
      sanitized = sanitized.substring(0, 5000);
    }

    return sanitized;
  }

  /**
   * Rate limiting key generator for specific operations
   * @param userId - User ID
   * @param operation - Operation type
   * @param resource - Resource identifier (optional)
   * @returns Rate limiting key
   */
  static generateRateLimitKey(
    userId: string,
    operation: string,
    resource?: string
  ): string {
    const sanitizedUserId = this.sanitizeString(userId, 100);
    const sanitizedOperation = this.sanitizeString(operation, 50);
    const sanitizedResource = resource
      ? this.sanitizeString(resource, 100)
      : "";

    return `${sanitizedUserId}:${sanitizedOperation}${
      sanitizedResource ? `:${sanitizedResource}` : ""
    }`;
  }
}
