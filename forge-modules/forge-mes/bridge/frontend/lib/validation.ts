import { z } from 'zod'
import DOMPurify from 'dompurify'
import { removeRunPrefix } from './recipe-utils'

// Manufacturing-specific validation schemas for whiskey production

// Recipe code validation (format: XXX-##-##-##-##-v## or RUN#-XXX-##-##-##-##-v##)
// Example: DWL-75-21-04-00-v01, WHT-60-40-00-00-v02, RYE-95-05-00-00-v01, RUN1-DWL-75-21-04-00-v01
export const recipeCodeSchema = z.string()
  .transform((val) => removeRunPrefix(val)) // Remove RUN#- prefix if present
  .pipe(
    z.string().regex(
      /^[A-Z]{3}-\d{2}-\d{2}-\d{2}-\d{2}-v\d{2}$/,
      'Recipe code must follow format: XXX-##-##-##-##-v## (e.g., DWL-75-21-04-00-v01) or RUN#-XXX-##-##-##-##-v##'
    )
  )

// Batch ID validation (format: BATCH-YYYY-MM-DD-###)
// Example: BATCH-2025-05-24-001
export const batchIdSchema = z.string()
  .regex(
    /^BATCH-\d{4}-\d{2}-\d{2}-\d{3}$/,
    'Batch ID must follow format: BATCH-YYYY-MM-DD-### (e.g., BATCH-2025-05-24-001)'
  )

// Proof value validation (0-200% ABV with 1 decimal place)
export const proofValueSchema = z.number()
  .min(0, 'Proof value cannot be negative')
  .max(200, 'Proof value cannot exceed 200%')
  .refine(
    (val) => Number(val.toFixed(1)) === val,
    'Proof value must have at most 1 decimal place'
  )

// Mash bill validation (format: ##-##-##-##, totaling 100)
// Example: 75-21-04-00, 60-40-00-00, 95-05-00-00
export const mashBillSchema = z.string()
  .regex(
    /^\d{2}-\d{2}-\d{2}-\d{2}$/,
    'Mash bill must follow format: ##-##-##-## (e.g., 75-21-04-00)'
  )
  .refine((val) => {
    const parts = val.split('-').map(Number)
    const total = parts.reduce((sum, part) => sum + part, 0)
    return total === 100
  }, 'Mash bill components must total 100%')

// Customer code validation (3-letter codes)
// Example: BHK, PAW, HNW, ABT, WHK, DST
export const customerCodeSchema = z.string()
  .regex(/^[A-Z]{3}$/, 'Customer code must be 3 uppercase letters')

// Equipment ID validation (format: TYPE##)
// Example: FV01, STILL02, TANK15
export const equipmentIdSchema = z.string()
  .regex(
    /^[A-Z]{2,10}\d{2}$/,
    'Equipment ID must be uppercase letters followed by 2 digits'
  )

// Temperature validation (-20°F to 250°F for distillery operations)
export const temperatureSchema = z.number()
  .min(-20, 'Temperature cannot be below -20°F')
  .max(250, 'Temperature cannot exceed 250°F')

// Duration validation (0-720 minutes for process steps)
export const durationMinutesSchema = z.number()
  .int('Duration must be a whole number of minutes')
  .min(0, 'Duration cannot be negative')
  .max(720, 'Duration cannot exceed 12 hours (720 minutes)')

// Volume validation for barrels and tanks (0-5000 gallons)
export const volumeGallonsSchema = z.number()
  .min(0, 'Volume cannot be negative')
  .max(5000, 'Volume cannot exceed 5000 gallons')
  .refine(
    (val) => Number(val.toFixed(2)) === val,
    'Volume must have at most 2 decimal places'
  )

// Barrel quantity validation (1-1000 barrels for production runs)
export const barrelQuantitySchema = z.number()
  .int('Barrel quantity must be a whole number')
  .min(1, 'Must have at least 1 barrel')
  .max(1000, 'Cannot exceed 1000 barrels per batch')

// pH value validation (0-14 with 2 decimal places)
export const pHValueSchema = z.number()
  .min(0, 'pH cannot be below 0')
  .max(14, 'pH cannot exceed 14')
  .refine(
    (val) => Number(val.toFixed(2)) === val,
    'pH must have at most 2 decimal places'
  )

// Specific gravity validation (0.800-1.200)
export const specificGravitySchema = z.number()
  .min(0.800, 'Specific gravity cannot be below 0.800')
  .max(1.200, 'Specific gravity cannot exceed 1.200')
  .refine(
    (val) => Number(val.toFixed(4)) === val,
    'Specific gravity must have at most 4 decimal places'
  )

// Production order status validation
export const productionStatusSchema = z.enum([
  'initiated',
  'in-progress',
  'completed',
  'on-hold',
  'cancelled',
  'delayed',
  'quality-hold'
], {
  errorMap: () => ({ message: 'Invalid production status' })
})

// Whiskey type validation
export const whiskeyTypeSchema = z.enum([
  'bourbon',
  'rye-bourbon', 
  'wheat-bourbon',
  'rye-whiskey',
  'wheat-whiskey',
  'corn-whiskey',
  'malt-whiskey',
  'blend'
], {
  errorMap: () => ({ message: 'Invalid whiskey type' })
})

// Container type validation for whiskey production
export const containerTypeSchema = z.enum([
  '53gal-barrel',
  '30gal-barrel', 
  '15gal-barrel',
  '500gal-tank',
  '1000gal-tank',
  '250gal-tote',
  '55gal-drum'
], {
  errorMap: () => ({ message: 'Invalid container type' })
})

// Manufacturing data interface
export interface ManufacturingData {
  recipeCode?: string
  batchId?: string
  proofValue?: number
  mashBill?: string
  temperature?: number
  barrelQuantity?: number
  customerCode?: string
  equipmentId?: string
  duration?: number
  volume?: number
  pH?: number
  specificGravity?: number
  productionStatus?: z.infer<typeof productionStatusSchema>
  whiskeyType?: z.infer<typeof whiskeyTypeSchema>
  containerType?: z.infer<typeof containerTypeSchema>
}

// Validation error interface
export interface ValidationError {
  field: string
  message: string
  value: unknown
}

// Input sanitization utilities
export class ManufacturingInputSanitizer {
  /**
   * Sanitize HTML content to prevent XSS attacks
   */
  static sanitizeHtml(input: string): string {
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: []
    })
  }

  /**
   * Sanitize and validate recipe code input
   */
  static sanitizeRecipeCode(input: string): string {
    const sanitized = this.sanitizeHtml(input.trim().toUpperCase())
    return sanitized.replace(/[^A-Z0-9-R]/g, '')
  }

  /**
   * Sanitize and validate batch ID input
   */
  static sanitizeBatchId(input: string): string {
    const sanitized = this.sanitizeHtml(input.trim().toUpperCase())
    return sanitized.replace(/[^A-Z0-9-]/g, '')
  }

  /**
   * Sanitize numeric input for manufacturing values
   */
  static sanitizeNumeric(input: string): string {
    const sanitized = this.sanitizeHtml(input.trim())
    return sanitized.replace(/[^0-9.-]/g, '')
  }

  /**
   * Sanitize alphanumeric input for codes and IDs
   */
  static sanitizeAlphanumeric(input: string): string {
    const sanitized = this.sanitizeHtml(input.trim())
    return sanitized.replace(/[^A-Za-z0-9]/g, '')
  }

  /**
   * Sanitize equipment ID input
   */
  static sanitizeEquipmentId(input: string): string {
    const sanitized = this.sanitizeHtml(input.trim().toUpperCase())
    return sanitized.replace(/[^A-Z0-9]/g, '')
  }
}

// Validation error handling
export class ManufacturingValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: unknown,
    public expectedFormat?: string
  ) {
    super(message)
    this.name = 'ManufacturingValidationError'
  }
}

// Comprehensive validation functions
export class ManufacturingValidator {
  /**
   * Validate recipe code with detailed error reporting
   */
  static validateRecipeCode(input: string): { isValid: boolean; error: string | undefined; sanitized: string } {
    const sanitized = ManufacturingInputSanitizer.sanitizeRecipeCode(input)
    const result = recipeCodeSchema.safeParse(sanitized)
    
    return {
      isValid: result.success,
      error: result.success ? undefined : result.error.errors[0]?.message,
      sanitized
    }
  }

  /**
   * Validate batch ID with detailed error reporting
   */
  static validateBatchId(input: string): { isValid: boolean; error: string | undefined; sanitized: string } {
    const sanitized = ManufacturingInputSanitizer.sanitizeBatchId(input)
    const result = batchIdSchema.safeParse(sanitized)
    
    return {
      isValid: result.success,
      error: result.success ? undefined : result.error.errors[0]?.message,
      sanitized
    }
  }

  /**
   * Validate proof value with manufacturing constraints
   */
  static validateProofValue(input: number): { isValid: boolean; error: string | undefined } {
    const result = proofValueSchema.safeParse(input)
    
    return {
      isValid: result.success,
      error: result.success ? undefined : result.error.errors[0]?.message
    }
  }

  /**
   * Validate mash bill percentages
   */
  static validateMashBill(input: string): { isValid: boolean; error: string | undefined; sanitized: string } {
    const sanitized = ManufacturingInputSanitizer.sanitizeHtml(input.trim())
    const result = mashBillSchema.safeParse(sanitized)
    
    return {
      isValid: result.success,
      error: result.success ? undefined : result.error.errors[0]?.message,
      sanitized
    }
  }

  /**
   * Validate temperature readings
   */
  static validateTemperature(input: number): { isValid: boolean; error: string | undefined } {
    const result = temperatureSchema.safeParse(input)
    
    return {
      isValid: result.success,
      error: result.success ? undefined : result.error.errors[0]?.message
    }
  }

  /**
   * Validate barrel quantities for production
   */
  static validateBarrelQuantity(input: number): { isValid: boolean; error: string | undefined } {
    const result = barrelQuantitySchema.safeParse(input)
    
    return {
      isValid: result.success,
      error: result.success ? undefined : result.error.errors[0]?.message
    }
  }

  /**
   * Comprehensive manufacturing data validation
   */
  static validateManufacturingData(data: ManufacturingData): {
    isValid: boolean
    errors: ValidationError[]
  } {
    const errors: ValidationError[] = []

    // Validate each field if present
    if (data.recipeCode !== undefined) {
      const result = this.validateRecipeCode(data.recipeCode)
      if (!result.isValid) {
        errors.push({
          field: 'recipeCode',
          message: result.error || 'Invalid recipe code',
          value: data.recipeCode
        })
      }
    }

    if (data.batchId !== undefined) {
      const result = this.validateBatchId(data.batchId)
      if (!result.isValid) {
        errors.push({
          field: 'batchId',
          message: result.error || 'Invalid batch ID',
          value: data.batchId
        })
      }
    }

    if (data.proofValue !== undefined) {
      const result = this.validateProofValue(data.proofValue)
      if (!result.isValid) {
        errors.push({
          field: 'proofValue',
          message: result.error || 'Invalid proof value',
          value: data.proofValue
        })
      }
    }

    if (data.mashBill !== undefined) {
      const result = this.validateMashBill(data.mashBill)
      if (!result.isValid) {
        errors.push({
          field: 'mashBill',
          message: result.error || 'Invalid mash bill',
          value: data.mashBill
        })
      }
    }

    if (data.temperature !== undefined) {
      const result = this.validateTemperature(data.temperature)
      if (!result.isValid) {
        errors.push({
          field: 'temperature',
          message: result.error || 'Invalid temperature',
          value: data.temperature
        })
      }
    }

    if (data.barrelQuantity !== undefined) {
      const result = this.validateBarrelQuantity(data.barrelQuantity)
      if (!result.isValid) {
        errors.push({
          field: 'barrelQuantity',
          message: result.error || 'Invalid barrel quantity',
          value: data.barrelQuantity
        })
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }
} 