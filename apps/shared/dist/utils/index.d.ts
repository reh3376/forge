/**
 * Format a date to a standard string format
 */
export declare function formatDate(date: Date | string, format?: string): string;
/**
 * Deep clone an object
 */
export declare function deepClone<T>(obj: T): T;
/**
 * Safely access nested object properties
 */
export declare function getNestedValue<T>(obj: Record<string, any>, path: string, defaultValue: T): T;
