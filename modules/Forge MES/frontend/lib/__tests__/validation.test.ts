import { recipeCodeSchema, ManufacturingValidator } from '../validation'

describe('Recipe Code Validation with RUN#- Prefix', () => {
  describe('recipeCodeSchema', () => {
    it('should validate recipe codes without RUN prefix', () => {
      const result = recipeCodeSchema.safeParse('DWL-75-21-04-00-v01')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('DWL-75-21-04-00-v01')
      }
    })

    it('should validate recipe codes with RUN prefix', () => {
      const result = recipeCodeSchema.safeParse('RUN1-DWL-75-21-04-00-v01')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('DWL-75-21-04-00-v01')
      }
    })

    it('should validate recipe codes with different RUN digits', () => {
      const result = recipeCodeSchema.safeParse('RUN9-WHK-74-18-00-08-v02')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('WHK-74-18-00-08-v02')
      }
    })

    it('should not validate recipe codes with multi-digit RUN prefix', () => {
      const result = recipeCodeSchema.safeParse('RUN10-DWL-75-21-04-00-v01')
      expect(result.success).toBe(false)
    })

    it('should not validate invalid recipe codes', () => {
      const result = recipeCodeSchema.safeParse('INVALID-CODE')
      expect(result.success).toBe(false)
    })
  })

  describe('ManufacturingValidator.validateRecipeCode', () => {
    it('should validate recipe codes without RUN prefix', () => {
      const result = ManufacturingValidator.validateRecipeCode('DWL-75-21-04-00-v01')
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
      expect(result.sanitized).toBe('DWL-75-21-04-00-v01')
    })

    it('should validate recipe codes with RUN prefix', () => {
      const result = ManufacturingValidator.validateRecipeCode('RUN1-DWL-75-21-04-00-v01')
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
      expect(result.sanitized).toBe('RUN1-DWL-75-21-04-00-v01')
    })

    it('should handle lowercase input', () => {
      const result = ManufacturingValidator.validateRecipeCode('run1-dwl-75-21-04-00-v01')
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
      expect(result.sanitized).toBe('RUN1-DWL-75-21-04-00-v01')
    })

    it('should reject invalid recipe codes', () => {
      const result = ManufacturingValidator.validateRecipeCode('INVALID-CODE')
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
}) 