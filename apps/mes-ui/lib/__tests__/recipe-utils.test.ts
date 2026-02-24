import { removeRunPrefix, parseMashBillFromRecipeName } from '../recipe-utils'
import { formatRecipeName, getMashBillFromRecipe } from '../utils'

describe('Recipe RUN#- Prefix Handling', () => {
  describe('removeRunPrefix', () => {
    it('should remove single digit RUN prefixes', () => {
      expect(removeRunPrefix('RUN1-DWL-75-21-04-00-v01')).toBe('DWL-75-21-04-00-v01')
      expect(removeRunPrefix('RUN9-WHK-74-18-00-08-v001')).toBe('WHK-74-18-00-08-v001')
    })

    it('should not remove multi-digit RUN prefixes', () => {
      expect(removeRunPrefix('RUN10-DWL-75-21-04-00-v01')).toBe('RUN10-DWL-75-21-04-00-v01')
      expect(removeRunPrefix('RUN123-DWL-75-21-04-00-v01')).toBe('RUN123-DWL-75-21-04-00-v01')
    })

    it('should return unchanged recipe names without RUN prefix', () => {
      expect(removeRunPrefix('DWL-75-21-04-00-v01')).toBe('DWL-75-21-04-00-v01')
      expect(removeRunPrefix('WHK-74-18-00-08-v001')).toBe('WHK-74-18-00-08-v001')
    })

    it('should not remove RUN prefix without dash', () => {
      expect(removeRunPrefix('RUN1DWL-75-21-04-00-v01')).toBe('RUN1DWL-75-21-04-00-v01')
    })
  })

  describe('parseMashBillFromRecipeName', () => {
    it('should parse mash bill from recipe names with RUN prefix', () => {
      const result = parseMashBillFromRecipeName('RUN1-DWL-75-21-04-00-v01')
      expect(result).toEqual({
        corn: 75,
        rye: 21,
        wheat: 4,
        maltedBarley: 0
      })
    })

    it('should parse mash bill from recipe names without RUN prefix', () => {
      const result = parseMashBillFromRecipeName('DWL-75-21-04-00-v01')
      expect(result).toEqual({
        corn: 75,
        rye: 21,
        wheat: 4,
        maltedBarley: 0
      })
    })

    it('should handle different RUN prefix digits', () => {
      const result = parseMashBillFromRecipeName('RUN9-WHK-74-18-00-08-v001')
      expect(result).toEqual({
        corn: 74,
        rye: 18,
        wheat: 0,
        maltedBarley: 8
      })
    })
  })

  describe('formatRecipeName', () => {
    it('should format recipe names with RUN prefix', () => {
      expect(formatRecipeName('RUN1-WHK-74-18-00-08-v001')).toBe('WHK-74-18')
    })

    it('should format recipe names without RUN prefix', () => {
      expect(formatRecipeName('WHK-74-18-00-08-v001')).toBe('WHK-74-18')
    })
  })

  describe('getMashBillFromRecipe', () => {
    it('should extract mash bill from recipe names with RUN prefix', () => {
      expect(getMashBillFromRecipe('RUN1-WHK-74-18-00-08-v001')).toBe('74-18-00-08')
    })

    it('should extract mash bill from recipe names without RUN prefix', () => {
      expect(getMashBillFromRecipe('WHK-74-18-00-08-v001')).toBe('74-18-00-08')
    })
  })
}) 