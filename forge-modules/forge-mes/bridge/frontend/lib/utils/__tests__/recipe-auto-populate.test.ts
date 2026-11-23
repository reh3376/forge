import { autoPopulateBOMItems, getDefaultAutoPopulateOptions, isBOMAutoPopulated, areParametersAutoPopulated, type MashBill } from '../recipe-auto-populate'

// Mock the recipe parameter client to avoid GraphQL client initialization in tests
jest.mock('@/lib/api/recipe-parameter-client', () => ({
  RecipeParameterClient: jest.fn().mockImplementation(() => ({
    getRecipeParameters: jest.fn().mockResolvedValue({
      recipeParameters: [
        {
          id: 'test-1',
          recipeParamName: 'CooksPerFerm',
          recipeParamDescription: 'Number of cooks per fermentation',
          isClassDefinition: true,
          required: true,
          recipeSetpointType: 'Numeric',
          recipeNumericalSetpoint: 3.0,
          units: { name: '', abbreviation: '' },
          operation: { name: '' }
        },
        {
          id: 'test-2',
          recipeParamName: 'IsFourGrain',
          recipeParamDescription: 'Four grain recipe flag',
          isClassDefinition: true,
          required: true,
          recipeSetpointType: 'Boolean',
          recipeSetpointBooleanValue: false,
          units: { name: '', abbreviation: '' },
          operation: { name: '' }
        }
      ]
    })
  }))
}))

describe('Recipe Auto-Populate', () => {
  const testMashBill: MashBill = {
    corn: 70,
    rye: 20,
    wheat: 5,
    maltedBarley: 5
  }

  describe('autoPopulateBOMItems', () => {
    it('should generate correct ingredients based on mash bill', () => {
      const options = {
        ...getDefaultAutoPopulateOptions(),
        mashBill: testMashBill
      }

      const ingredients = autoPopulateBOMItems(options)

      // Should have 7 ingredients: water, backset, corn, rye, wheat, malted barley, citric acid
      expect(ingredients).toHaveLength(7)

      // Check water - percentage based
      const water = ingredients.find(ing => ing.id === 'auto_water')
      expect(water).toBeDefined()
      expect(water?.quantity).toBe(70)
      expect(water?.unit).toBe('%')

      // Check backset - percentage based
      const backset = ingredients.find(ing => ing.id === 'auto_backset')
      expect(backset).toBeDefined()
      expect(backset?.quantity).toBe(30)
      expect(backset?.unit).toBe('%')

      // Check grains - percentages
      const corn = ingredients.find(ing => ing.id === 'auto_corn')
      expect(corn).toBeDefined()
      expect(corn?.quantity).toBe(70)
      expect(corn?.unit).toBe('%')

      const rye = ingredients.find(ing => ing.id === 'auto_rye')
      expect(rye).toBeDefined()
      expect(rye?.quantity).toBe(20)
      expect(rye?.unit).toBe('%')

      const wheat = ingredients.find(ing => ing.id === 'auto_wheat')
      expect(wheat).toBeDefined()
      expect(wheat?.quantity).toBe(5)
      expect(wheat?.unit).toBe('%')

      const maltedBarley = ingredients.find(ing => ing.id === 'auto_maltedBarley')
      expect(maltedBarley).toBeDefined()
      expect(maltedBarley?.quantity).toBe(5)
      expect(maltedBarley?.unit).toBe('%')

      // Should have citric acid (now enabled with default 0.5 lbs)
      const citricAcid = ingredients.find(ing => ing.id === 'auto_citric_acid')
      expect(citricAcid).toBeDefined()
      expect(citricAcid?.quantity).toBe(0.5)
      expect(citricAcid?.unit).toBe('lbs')
    })

    it('should skip grains with 0% in mash bill', () => {
      const mashBillWithZeros: MashBill = {
        corn: 80,
        rye: 20,
        wheat: 0, // Should be skipped
        maltedBarley: 0 // Should be skipped
      }

      const options = {
        ...getDefaultAutoPopulateOptions(),
        mashBill: mashBillWithZeros
      }

      const ingredients = autoPopulateBOMItems(options)

      // Should have 5 ingredients: water, backset, corn, rye, citric acid (no wheat, no malted barley)
      expect(ingredients).toHaveLength(5)

      const wheat = ingredients.find(ing => ing.id === 'auto_wheat')
      expect(wheat).toBeUndefined()

      const maltedBarley = ingredients.find(ing => ing.id === 'auto_maltedBarley')
      expect(maltedBarley).toBeUndefined()
    })
  })

  describe('isBOMAutoPopulated', () => {
    it('should return true when ingredients contain auto-generated items', () => {
      const ingredients = autoPopulateBOMItems({
        ...getDefaultAutoPopulateOptions(),
        mashBill: testMashBill
      })

      expect(isBOMAutoPopulated(ingredients)).toBe(true)
    })

    it('should return false when ingredients do not contain auto-generated items', () => {
      const manualIngredients = [
        {
          id: 'manual_1',
          itemCode: 'MANUAL-001',
          name: 'Manual Ingredient',
          quantity: 100,
          unit: 'lbs',
          category: 'grains' as const,
          createdAt: new Date()
        }
      ]

      expect(isBOMAutoPopulated(manualIngredients)).toBe(false)
    })
  })

  describe('areParametersAutoPopulated', () => {
    it('should return true when parameters contain auto-generated items', () => {
      const autoParameters = [
        {
          id: 'auto_CooksPerFerm',
          name: 'CooksPerFerm',
          description: 'Number of cooks per fermentation',
          type: 'numeric' as const,
          value: 3,
          createdAt: new Date()
        }
      ]

      expect(areParametersAutoPopulated(autoParameters)).toBe(true)
    })

    it('should return false when parameters do not contain auto-generated items', () => {
      const manualParameters = [
        {
          id: 'manual_param_1',
          name: 'Manual Parameter',
          description: 'A manual parameter',
          type: 'numeric' as const,
          value: 100,
          createdAt: new Date()
        }
      ]

      expect(areParametersAutoPopulated(manualParameters)).toBe(false)
    })
  })
}) 