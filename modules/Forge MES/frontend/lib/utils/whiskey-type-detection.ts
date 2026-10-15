/**
 * Whiskey Type Detection Utility
 * 
 * Detects whiskey type based on mash bill composition following TTB regulations
 * and industry standards. This matches the backend logic for consistent classification.
 */

// Whiskey types matching the frontend enum values
export enum WhiskeyType {
  FourGrainBourbon = 'FourGrainBourbon',
  FourGrainWhiskey = 'FourGrainWhiskey', 
  MaltWhiskey = 'MaltWhiskey',
  RyeBourbon = 'RyeBourbon',
  RyeWhiskey = 'RyeWhiskey',
  WheatWhiskey = 'WheatWhiskey',
  WheatedBourbon = 'WheatedBourbon'
}

// Mash bill interface matching the frontend structure
export interface MashBill {
  corn: number
  rye: number
  wheat: number
  maltedBarley: number
}

/**
 * Detects whiskey type based on mash bill composition
 * 
 * Logic:
 * - Malt Whiskey: >=51% malted barley
 * - Rye Whiskey: >=51% rye
 * - Wheat Whiskey: >=51% wheat
 * - For corn >=51%:
 *   - Wheated Bourbon: corn + wheat (wheat is secondary grain, rye minimal)
 *   - Rye Bourbon: corn + rye (rye is secondary grain, wheat minimal)
 *   - Four Grain Bourbon: corn + rye + wheat + malt (all 4 grains present in meaningful amounts)
 * 
 * @param mashBill - The mash bill composition percentages
 * @returns The detected whiskey type or null if invalid
 */
export function detectWhiskeyType(mashBill: MashBill): WhiskeyType | null {
  // Validate mash bill
  if (!isValidMashBill(mashBill)) {
    return null
  }

  const { corn, rye, wheat, maltedBarley } = mashBill

  // Check for primary grain >=51%
  if (maltedBarley >= 51) {
    return WhiskeyType.MaltWhiskey
  }
  
  if (rye >= 51) {
    return WhiskeyType.RyeWhiskey
  }
  
  if (wheat >= 51) {
    return WhiskeyType.WheatWhiskey
  }

  // For corn >=51%, determine bourbon type based on secondary grains
  if (corn >= 51) {
    // Check for wheated bourbon first (wheat as secondary grain)
    // Wheated bourbon typically has wheat as the secondary grain with minimal rye
    if (wheat > 0 && wheat > rye) {
      // If all four grains are present in meaningful amounts, it's four grain
      if (rye >= 5 && wheat >= 5 && maltedBarley >= 5) {
        return WhiskeyType.FourGrainBourbon
      }
      return WhiskeyType.WheatedBourbon
    }
    
    // Check for rye bourbon (rye as secondary grain)
    if (rye > 0) {
      // If all four grains are present in meaningful amounts, it's four grain
      if (rye >= 5 && wheat >= 5 && maltedBarley >= 5) {
        return WhiskeyType.FourGrainBourbon
      }
      return WhiskeyType.RyeBourbon
    }
  }

  // If no clear classification, return null
  return null
}

/**
 * Validates that a mash bill is properly formatted and totals 100%
 */
export function isValidMashBill(mashBill: MashBill): boolean {
  const { corn, rye, wheat, maltedBarley } = mashBill
  
  // Check for negative values
  if (corn < 0 || rye < 0 || wheat < 0 || maltedBarley < 0) {
    return false
  }
  
  // Check that total equals 100%
  const total = corn + rye + wheat + maltedBarley
  return Math.abs(total - 100) < 0.01 // Allow for small floating point errors
}

/**
 * Gets a human-readable description of the whiskey type
 */
export function getWhiskeyTypeDescription(whiskeyType: WhiskeyType): string {
  const descriptions: Record<WhiskeyType, string> = {
    [WhiskeyType.FourGrainBourbon]: 'A bourbon containing all four grains: corn, rye, wheat, and malted barley',
    [WhiskeyType.FourGrainWhiskey]: 'A whiskey containing all four grains without bourbon classification',
    [WhiskeyType.MaltWhiskey]: 'A whiskey with malted barley as the primary grain (>51%)',
    [WhiskeyType.RyeBourbon]: 'A bourbon with rye as the secondary grain after corn',
    [WhiskeyType.RyeWhiskey]: 'A whiskey with rye as the primary grain (>51%)',
    [WhiskeyType.WheatWhiskey]: 'A whiskey with wheat as the primary grain (>51%)',
    [WhiskeyType.WheatedBourbon]: 'A bourbon with wheat as the secondary grain after corn'
  }
  
  return descriptions[whiskeyType] || 'Unknown whiskey type'
}

/**
 * Gets a human-readable label for the whiskey type
 */
export function getWhiskeyTypeLabel(whiskeyType: WhiskeyType): string {
  const labels: Record<WhiskeyType, string> = {
    [WhiskeyType.FourGrainBourbon]: 'Four Grain Bourbon',
    [WhiskeyType.FourGrainWhiskey]: 'Four Grain Whiskey',
    [WhiskeyType.MaltWhiskey]: 'Malt Whiskey',
    [WhiskeyType.RyeBourbon]: 'Rye Bourbon',
    [WhiskeyType.RyeWhiskey]: 'Rye Whiskey',
    [WhiskeyType.WheatWhiskey]: 'Wheat Whiskey',
    [WhiskeyType.WheatedBourbon]: 'Wheated Bourbon'
  }
  
  return labels[whiskeyType] || 'Unknown'
}

/**
 * Converts a mash bill to the string format used in the backend
 */
export function mashBillToString(mashBill: MashBill): string {
  const { corn, rye, wheat, maltedBarley } = mashBill
  return `${corn.toString().padStart(2, '0')}-${rye.toString().padStart(2, '0')}-${wheat.toString().padStart(2, '0')}-${maltedBarley.toString().padStart(2, '0')}`
}

/**
 * Parses a mash bill string back to MashBill object
 */
export function parseMashBillString(mashBillString: string): MashBill | null {
  const parts = mashBillString.split('-')
  if (parts.length !== 4) {
    return null
  }
  
  const numbers = parts.map(p => parseInt(p, 10))
  
  if (numbers.some(n => isNaN(n)) || numbers.length !== 4) {
    return null
  }
  
  return { 
    corn: numbers[0]!, 
    rye: numbers[1]!, 
    wheat: numbers[2]!, 
    maltedBarley: numbers[3]! 
  }
} 