/**
 * Tests for whiskey type detection utility
 */

import { detectWhiskeyType, isValidMashBill, WhiskeyType, type MashBill } from '../whiskey-type-detection'

describe('Whiskey Type Detection', () => {
  describe('detectWhiskeyType', () => {
    it('should detect Rye Whiskey when rye > 51%', () => {
      const mashBill: MashBill = { corn: 30, rye: 60, wheat: 5, maltedBarley: 5 }
      expect(detectWhiskeyType(mashBill)).toBe(WhiskeyType.RyeWhiskey)
    })

    it('should detect Wheat Whiskey when wheat > 51%', () => {
      const mashBill: MashBill = { corn: 30, rye: 5, wheat: 60, maltedBarley: 5 }
      expect(detectWhiskeyType(mashBill)).toBe(WhiskeyType.WheatWhiskey)
    })

    it('should detect Malt Whiskey when malted barley > 51%', () => {
      const mashBill: MashBill = { corn: 30, rye: 5, wheat: 5, maltedBarley: 60 }
      expect(detectWhiskeyType(mashBill)).toBe(WhiskeyType.MaltWhiskey)
    })

    it('should detect Four Grain Bourbon when corn > 51% and all grains present in meaningful amounts', () => {
      const mashBill: MashBill = { corn: 60, rye: 15, wheat: 15, maltedBarley: 10 }
      expect(detectWhiskeyType(mashBill)).toBe(WhiskeyType.FourGrainBourbon)
    })

    it('should detect Wheated Bourbon when corn > 51% and wheat > rye', () => {
      const mashBill: MashBill = { corn: 75, rye: 2, wheat: 15, maltedBarley: 8 }
      expect(detectWhiskeyType(mashBill)).toBe(WhiskeyType.WheatedBourbon)
    })

    it('should detect Rye Bourbon when corn > 51% and rye > wheat', () => {
      const mashBill: MashBill = { corn: 70, rye: 20, wheat: 0, maltedBarley: 10 }
      expect(detectWhiskeyType(mashBill)).toBe(WhiskeyType.RyeBourbon)
    })

    it('should return null for invalid mash bill (not totaling 100%)', () => {
      const mashBill: MashBill = { corn: 50, rye: 20, wheat: 10, maltedBarley: 10 }
      expect(detectWhiskeyType(mashBill)).toBeNull()
    })

    it('should return null for mash bill with negative values', () => {
      const mashBill: MashBill = { corn: 110, rye: -10, wheat: 0, maltedBarley: 0 }
      expect(detectWhiskeyType(mashBill)).toBeNull()
    })
  })

  describe('isValidMashBill', () => {
    it('should return true for valid mash bill totaling 100%', () => {
      const mashBill: MashBill = { corn: 60, rye: 20, wheat: 10, maltedBarley: 10 }
      expect(isValidMashBill(mashBill)).toBe(true)
    })

    it('should return false for mash bill not totaling 100%', () => {
      const mashBill: MashBill = { corn: 60, rye: 20, wheat: 10, maltedBarley: 5 }
      expect(isValidMashBill(mashBill)).toBe(false)
    })

    it('should return false for mash bill with negative values', () => {
      const mashBill: MashBill = { corn: 110, rye: -10, wheat: 0, maltedBarley: 0 }
      expect(isValidMashBill(mashBill)).toBe(false)
    })

    it('should handle floating point precision', () => {
      const mashBill: MashBill = { corn: 60.1, rye: 20.1, wheat: 10.4, maltedBarley: 9.4 }
      expect(isValidMashBill(mashBill)).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle exactly 51% primary grain', () => {
      const mashBill: MashBill = { corn: 30, rye: 51, wheat: 9, maltedBarley: 10 }
      expect(detectWhiskeyType(mashBill)).toBe(WhiskeyType.RyeWhiskey)
    })

    it('should prioritize higher percentage grains', () => {
      // Malted barley has highest percentage
      const mashBill: MashBill = { corn: 20, rye: 25, wheat: 25, maltedBarley: 30 }
      expect(detectWhiskeyType(mashBill)).toBeNull() // No grain > 51%
    })

    it('should handle corn-only mash bill', () => {
      const mashBill: MashBill = { corn: 100, rye: 0, wheat: 0, maltedBarley: 0 }
      expect(detectWhiskeyType(mashBill)).toBeNull() // No secondary grains for bourbon classification
    })
  })
}) 