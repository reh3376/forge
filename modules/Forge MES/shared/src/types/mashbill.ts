/**
 * Shared types for Mashbill parsing and formatting
 * Used by both backend and frontend
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
  format: 'new' | 'legacy';
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
 * Grain abbreviation mappings
 */
export const GRAIN_ABBREVIATIONS = {
  C: 'Corn',
  R: 'Rye',
  Y: 'Malted Rye',
  W: 'Wheat',
  M: 'Malt',
  S: 'Specialty',
  B: 'Buckwheat',
  O: 'Oats',
  Z: 'Zinfandel',
} as const;

export type GrainAbbreviation = keyof typeof GRAIN_ABBREVIATIONS;
export type GrainName = typeof GRAIN_ABBREVIATIONS[GrainAbbreviation];

/**
 * GrainCharacter model type (mirrors Prisma model)
 */
export interface GrainCharacter {
  id: string;
  grainType: string;
  abbreviation: string;
  name: string;
  varietyCode?: string | null;
  description?: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input types for creating/updating grain characters
 */
export interface CreateGrainCharacterInput {
  grainType: string;
  abbreviation: string;
  name: string;
  varietyCode?: string;
  description?: string;
  active?: boolean;
}

export interface UpdateGrainCharacterInput {
  grainType?: string;
  abbreviation?: string;
  name?: string;
  varietyCode?: string;
  description?: string;
  active?: boolean;
}
