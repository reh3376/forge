/**
 * Recipe utility functions for parsing and handling whiskey recipe data
 */

export interface MashBill {
  corn: number
  rye: number
  wheat: number
  maltedBarley: number
  sorghum?: number
  other?: number
}

/**
 * Component in a mash bill with grain character and percentage
 */
export interface MashBillComponent {
  char: string
  percentage: number
  grainName?: string
  variety?: string
}

/**
 * Parsed recipe result with format detection
 */
export interface ParsedRecipe {
  customerCode: string
  format: 'new' | 'legacy' | 'unknown'
  revision: number
  components: MashBillComponent[]
  totalPercentage: number
  isValid: boolean
}

/**
 * Grain abbreviation to name mapping
 */
export const GRAIN_ABBREVIATIONS: Record<string, string> = {
  C: 'Corn',
  R: 'Rye',
  Y: 'Malted Rye',
  W: 'Wheat',
  M: 'Malt',
  S: 'Sorghum',
  B: 'Buckwheat',
  O: 'Oats',
  G: 'Sorghum', // Alias for S
  T: 'Triticale',
  X: 'Other',
}

/**
 * Detect the format of a recipe string
 *
 * @param recipeString - Recipe string to analyze
 * @returns 'new' for letter suffix format, 'legacy' for numeric format, 'unknown' otherwise
 *
 * @example
 * ```typescript
 * detectRecipeFormat('WHK-75C-21R-4M-v01') // Returns: 'new'
 * detectRecipeFormat('WHK-75-21-00-04-v01') // Returns: 'legacy'
 * ```
 */
export function detectRecipeFormat(recipeString: string): 'new' | 'legacy' | 'unknown' {
  if (!recipeString) return 'unknown'

  // Clean up the string
  const cleaned = removeRunPrefix(recipeString)
  const parts = cleaned.split('-')

  if (parts.length < 3) return 'unknown'

  // Check for new format: parts after customer code have letter suffixes
  // e.g., "75C", "21R", "4M"
  const hasLetterSuffix = parts.slice(1).some(part =>
    /^\d+(\.\d+)?[A-Z]/.test(part) && !/^[Rv]\d+$/.test(part)
  )

  if (hasLetterSuffix) return 'new'

  // Check for legacy format: exactly 5 numeric parts after customer code
  // e.g., "75", "21", "00", "04", "R01"
  const numericParts = parts.slice(1, -1)
  const hasLegacyStructure = numericParts.length === 4 &&
    numericParts.every(part => /^\d+$/.test(part))

  if (hasLegacyStructure) return 'legacy'

  return 'unknown'
}

/**
 * Parse a recipe string in new format (with letter suffixes)
 *
 * @param recipeString - Recipe string like "WHK-75C-21R-4M-v01"
 * @returns ParsedRecipe object
 */
export function parseNewFormatRecipe(recipeString: string): ParsedRecipe {
  const cleaned = removeRunPrefix(recipeString)
  const parts = cleaned.split('-')

  const customerCode = parts[0] || ''
  const components: MashBillComponent[] = []
  let revision = 1

  // Parse each part after customer code
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue

    // Check for revision (R##)
    const revMatch = part.match(/^[Rv](\d+)$/)
    if (revMatch) {
      revision = parseInt(revMatch[1], 10)
      continue
    }

    // Parse component: percentage + char + optional variety
    // e.g., "75C", "30R1", "68.5C"
    const compMatch = part.match(/^(\d+(?:\.\d+)?)([A-Z])(\d+)?$/)
    if (compMatch) {
      const percentage = parseFloat(compMatch[1])
      const char = compMatch[2]
      const variety = compMatch[3]

      components.push({
        char,
        percentage,
        grainName: GRAIN_ABBREVIATIONS[char] || char,
        ...(variety && { variety })
      })
    }
  }

  const totalPercentage = components.reduce((sum, c) => sum + c.percentage, 0)

  return {
    customerCode,
    format: 'new',
    revision,
    components,
    totalPercentage,
    isValid: Math.abs(totalPercentage - 100) < 0.01
  }
}

/**
 * Parse a recipe string in legacy format (numeric parts)
 *
 * @param recipeString - Recipe string like "WHK-75-21-00-04-v01"
 * @returns ParsedRecipe object
 */
export function parseLegacyFormatRecipe(recipeString: string): ParsedRecipe {
  const cleaned = removeRunPrefix(recipeString)
  const parts = cleaned.split('-')

  const customerCode = parts[0] || ''
  const components: MashBillComponent[] = []
  let revision = 1

  // Legacy format: CCC-corn-rye-wheat-malt-v##
  if (parts.length >= 6) {
    const corn = parseInt(parts[1], 10)
    const rye = parseInt(parts[2], 10)
    const wheat = parseInt(parts[3], 10)
    const malt = parseInt(parts[4], 10)

    // Parse revision
    const revPart = parts[5]
    if (revPart) {
      const revMatch = revPart.match(/^[Rv](\d+)$/)
      if (revMatch) {
        revision = parseInt(revMatch[1], 10)
      }
    }

    // Add non-zero components
    if (corn > 0) components.push({ char: 'C', percentage: corn, grainName: 'Corn' })
    if (rye > 0) components.push({ char: 'R', percentage: rye, grainName: 'Rye' })
    if (wheat > 0) components.push({ char: 'W', percentage: wheat, grainName: 'Wheat' })
    if (malt > 0) components.push({ char: 'M', percentage: malt, grainName: 'Malt' })
  }

  const totalPercentage = components.reduce((sum, c) => sum + c.percentage, 0)

  return {
    customerCode,
    format: 'legacy',
    revision,
    components,
    totalPercentage,
    isValid: totalPercentage === 100
  }
}

/**
 * Parse a recipe string (auto-detects format)
 *
 * @param recipeString - Recipe string in either format
 * @returns ParsedRecipe object
 *
 * @example
 * ```typescript
 * parseRecipeString('WHK-75C-21R-4M-v01')
 * // Returns: { customerCode: 'WHK', format: 'new', components: [...], ... }
 *
 * parseRecipeString('WHK-75-21-00-04-v01')
 * // Returns: { customerCode: 'WHK', format: 'legacy', components: [...], ... }
 * ```
 */
export function parseRecipeString(recipeString: string): ParsedRecipe {
  const format = detectRecipeFormat(recipeString)

  if (format === 'new') {
    return parseNewFormatRecipe(recipeString)
  } else if (format === 'legacy') {
    return parseLegacyFormatRecipe(recipeString)
  }

  // Unknown format
  return {
    customerCode: '',
    format: 'unknown',
    revision: 0,
    components: [],
    totalPercentage: 0,
    isValid: false
  }
}

/**
 * Convert legacy format to new format
 *
 * @param legacyString - Legacy format recipe string
 * @returns New format recipe string
 *
 * @example
 * ```typescript
 * convertLegacyToNew('WHK-75-21-00-04-v01')
 * // Returns: 'WHK-75C-21R-4M-v01'
 * ```
 */
export function convertLegacyToNew(legacyString: string): string {
  const parsed = parseLegacyFormatRecipe(legacyString)

  if (parsed.components.length === 0) {
    throw new Error('Invalid legacy recipe string format')
  }

  const componentStrs = parsed.components.map(c =>
    `${c.percentage}${c.char}${c.variety || ''}`
  )

  const revStr = `v${parsed.revision.toString().padStart(2, '0')}`

  return `${parsed.customerCode}-${componentStrs.join('-')}-${revStr}`
}

/**
 * Format components into a recipe string
 *
 * @param customerCode - Customer code prefix
 * @param components - Array of mash bill components
 * @param revision - Revision number
 * @returns Formatted recipe string
 */
export function formatRecipeString(
  customerCode: string,
  components: MashBillComponent[],
  revision: number = 1
): string {
  const componentStrs = components.map(c => {
    const pct = Number.isInteger(c.percentage) ? c.percentage : c.percentage
    return `${pct}${c.char}${c.variety || ''}`
  })

  const revStr = `v${revision.toString().padStart(2, '0')}`

  return `${customerCode}-${componentStrs.join('-')}-${revStr}`
}

/**
 * Remove RUN#- prefix from recipe name if present (where # is a single digit)
 * 
 * @param recipeName - Recipe name that may have a RUN#- prefix
 * @returns Recipe name with RUN#- prefix removed
 * 
 * @example
 * ```typescript
 * removeRunPrefix("RUN1-DWL-75-21-04-00-v01") // Returns: "DWL-75-21-04-00-v01"
 * removeRunPrefix("RUN9-WHK-74-18-00-08-v001") // Returns: "WHK-74-18-00-08-v001"
 * removeRunPrefix("DWL-75-21-04-00-v01") // Returns: "DWL-75-21-04-00-v01" (no change)
 * removeRunPrefix("RUN10-DWL-75-21-04-00-v01") // Returns: "RUN10-DWL-75-21-04-00-v01" (no change, 10 is not single digit)
 * ```
 */
export function removeRunPrefix(recipeName: string): string {
  const runPrefixMatch = recipeName.match(/^RUN\d-(.+)$/)
  if (runPrefixMatch && runPrefixMatch[1]) {
    return runPrefixMatch[1]
  }
  return recipeName
}

/**
 * Ingredient category based on item group patterns
 */
export type IngredientCategory = 'water' | 'grains' | 'yeast' | 'enzymes' | 'other'

/**
 * Categorize an ingredient based on its item group
 * 
 * @param itemGroup - Item group code (e.g., "RM-GR-CORN", "RM-YEA", "RM-ENZ")
 * @param itemName - Item name (optional, used for fallback categorization when itemGroup is null)
 * @param itemNumber - Item number (optional, used for fallback categorization when itemGroup is null)
 * @returns IngredientCategory
 * 
 * @example
 * ```typescript
 * categorizeIngredientByItemGroup("RM-GR-CORN") // Returns: "grains"
 * categorizeIngredientByItemGroup("RM-YEA") // Returns: "yeast"
 * categorizeIngredientByItemGroup("RM-ENZ") // Returns: "enzymes"
 * categorizeIngredientByItemGroup(null, "Water") // Returns: "water"
 * categorizeIngredientByItemGroup(null, "Backset Water") // Returns: "water"
 * ```
 */
export function categorizeIngredientByItemGroup(
  itemGroup: string | null | undefined,
  itemName?: string,
  itemNumber?: string
): IngredientCategory {
  if (!itemGroup) {
    // Fallback categorization when itemGroup is null
    const name = (itemName || '').toLowerCase()
    const number = (itemNumber || '').toLowerCase()

    // Check for water items
    if (name.includes('water') || number.includes('water')) {
      return 'water'
    }

    // Check for yeast items
    if (name.includes('yeast') || number.includes('yeast')) {
      return 'yeast'
    }

    // Check for enzyme items
    if (name.includes('enzyme') || number.includes('enzyme')) {
      return 'enzymes'
    }

    // Check for grain items - common grain names and patterns
    const grainPatterns = [
      'corn', 'maize', 'rye', 'wheat', 'barley', 'malt', 'malted',
      'sorghum', 'oat', 'oats', 'buckwheat', 'triticale', 'millet',
      'grain', 'grist'
    ]
    if (grainPatterns.some(pattern => name.includes(pattern) || number.includes(pattern))) {
      return 'grains'
    }

    return 'other'
  }

  const group = itemGroup.toUpperCase()

  // Grains: RM-GR-*
  if (group.startsWith('RM-GR-')) {
    return 'grains'
  }

  // Yeast: RM-YEA
  if (group === 'RM-YEA') {
    return 'yeast'
  }

  // Enzymes: RM-ENZ
  if (group === 'RM-ENZ') {
    return 'enzymes'
  }

  // Water: RM-WAT, RM-WATER, or contains WATER/H2O
  if (group === 'RM-WAT' || group === 'RM-WATER' || group.includes('WATER') || group.includes('H2O')) {
    return 'water'
  }

  // Default to other for unrecognized patterns
  return 'other'
}

/**
 * Get display label for ingredient category
 * 
 * @param category - IngredientCategory
 * @returns Display label string
 */
export function getIngredientCategoryLabel(category: IngredientCategory): string {
  switch (category) {
    case 'water':
      return 'Water'
    case 'grains':
      return 'Grains'
    case 'yeast':
      return 'Yeast'
    case 'enzymes':
      return 'Enzymes'
    case 'other':
      return 'Other'
    default:
      return 'Other'
  }
}

/**
 * Parse mash bill components from recipe name following the format: CCC-NN-NN-NN-NN-v##
 * Where CCC is customer code, NN-NN-NN-NN are percentages for corn-rye-wheat-malt, and R## is revision
 * Ignores RUN#- prefixes where # is a single digit (e.g., "RUN1-DWL-75-21-04-00-v01")
 * 
 * @param recipeName - Recipe name in format like "DWL-75-21-04-00-v01" or "RUN1-DWL-75-21-04-00-v01"
 * @returns MashBill object with percentages or null if parsing fails
 * 
 * @example
 * ```typescript
 * const mashBill = parseMashBillFromRecipeName("DWL-75-21-04-00-v01")
 * // Returns: { corn: 75, rye: 21, wheat: 4, maltedBarley: 0 }
 * 
 * const mashBillWithPrefix = parseMashBillFromRecipeName("RUN1-DWL-75-21-04-00-v01")
 * // Returns: { corn: 75, rye: 21, wheat: 4, maltedBarley: 0 }
 * ```
 */
export function parseMashBillFromRecipeName(recipeName: string): MashBill | null {
  if (!recipeName) {
    return null
  }

  // Use the new universal parser that handles both legacy and new formats
  const parsed = parseRecipeString(recipeName)

  if (!parsed.isValid || parsed.components.length === 0) {
    return null
  }

  // Convert ParsedRecipe to MashBill for backward compatibility
  return parsedRecipeToMashBill(parsed)
}

/**
 * Format mash bill as a display string
 *
 * @param mashBill - MashBill object with percentages
 * @returns Formatted string like "75% Corn, 21% Rye, 4% Wheat"
 */
export function formatMashBillDisplay(mashBill: MashBill): string {
  const components = []

  if (mashBill.corn > 0) components.push(`${mashBill.corn}% Corn`)
  if (mashBill.rye > 0) components.push(`${mashBill.rye}% Rye`)
  if (mashBill.wheat > 0) components.push(`${mashBill.wheat}% Wheat`)
  if (mashBill.maltedBarley > 0) components.push(`${mashBill.maltedBarley}% Malted Barley`)
  if (mashBill.sorghum && mashBill.sorghum > 0) components.push(`${mashBill.sorghum}% Sorghum`)
  if (mashBill.other && mashBill.other > 0) components.push(`${mashBill.other}% Other`)

  return components.join(', ')
}

/**
 * Format mash bill components as a display string (for new format)
 *
 * @param components - Array of MashBillComponent objects
 * @returns Formatted string like "75% Corn, 21% Rye, 4% Malt"
 */
export function formatComponentsDisplay(components: MashBillComponent[]): string {
  return components
    .filter(c => c.percentage > 0)
    .map(c => {
      const name = c.grainName || GRAIN_ABBREVIATIONS[c.char] || c.char
      const variety = c.variety ? ` (${c.variety})` : ''
      return `${c.percentage}% ${name}${variety}`
    })
    .join(', ')
}

/**
 * Convert ParsedRecipe to legacy MashBill format for backward compatibility
 *
 * @param parsed - ParsedRecipe object
 * @returns MashBill object (may lose specialty grain data)
 */
export function parsedRecipeToMashBill(parsed: ParsedRecipe): MashBill {
  const mashBill: MashBill = {
    corn: 0,
    rye: 0,
    wheat: 0,
    maltedBarley: 0,
    sorghum: 0,
    other: 0
  }

  for (const component of parsed.components) {
    switch (component.char) {
      case 'C':
        mashBill.corn += component.percentage
        break
      case 'R':
      case 'Y': // Malted Rye counted as Rye
        mashBill.rye += component.percentage
        break
      case 'W':
        mashBill.wheat += component.percentage
        break
      case 'M':
        mashBill.maltedBarley += component.percentage
        break
      case 'S':
      case 'G': // Sorghum aliases
        mashBill.sorghum = (mashBill.sorghum || 0) + component.percentage
        break
      default:
        // Other specialty grains (B, O, T, X, etc.)
        mashBill.other = (mashBill.other || 0) + component.percentage
        break
    }
  }

  return mashBill
}

/**
 * Get the total percentage of a mash bill
 * 
 * @param mashBill - MashBill object with percentages
 * @returns Total percentage (should typically be 100 for valid recipes)
 */
export function getMashBillTotal(mashBill: MashBill): number {
  return mashBill.corn + mashBill.rye + mashBill.wheat + mashBill.maltedBarley +
         (mashBill.sorghum || 0) + (mashBill.other || 0)
}

/**
 * Validate that a mash bill totals to 100%
 * 
 * @param mashBill - MashBill object with percentages
 * @returns True if total equals 100%
 */
export function isValidMashBill(mashBill: MashBill): boolean {
  return getMashBillTotal(mashBill) === 100
}

/**
 * Recipe family type for grouping recipes by their base identifier
 */
export interface RecipeFamily<T> {
  /** Base recipe identifier (e.g., "BHK-95R-5M" from "BHK-95R-5M-v01") */
  familyId: string
  /** Customer code extracted from the recipe name */
  customerCode: string
  /** All revisions sorted by revision number (newest first) */
  revisions: T[]
  /** Latest (highest) revision */
  latestRevision: T
  /** Number of revisions in this family */
  revisionCount: number
}

/**
 * Extract the family identifier from a recipe name by removing the revision suffix
 *
 * @param recipeName - Full recipe name like "BHK-95R-5M-v02"
 * @returns Family identifier like "BHK-95R-5M"
 *
 * @example
 * ```typescript
 * getRecipeFamilyId("BHK-95R-5M-v02") // Returns: "BHK-95R-5M"
 * getRecipeFamilyId("WHK-75C-21R-4M-v01") // Returns: "WHK-75C-21R-4M"
 * getRecipeFamilyId("RUN1-DWL-75-21-04-00-v01") // Returns: "DWL-75-21-04-00"
 * ```
 */
export function getRecipeFamilyId(recipeName: string): string {
  if (!recipeName) return ''

  // Remove RUN prefix if present
  const cleaned = removeRunPrefix(recipeName)

  // Remove revision suffix (R## at the end)
  const withoutRevision = cleaned.replace(/-[Rv]\d+$/, '')

  return withoutRevision
}

/**
 * Extract revision number from a recipe name
 *
 * @param recipeName - Full recipe name like "BHK-95R-5M-v02"
 * @returns Revision number (e.g., 2) or 1 if not found
 */
export function getRecipeRevision(recipeName: string): number {
  if (!recipeName) return 1

  const cleaned = removeRunPrefix(recipeName)
  const match = cleaned.match(/-[Rv](\d+)$/)

  return match ? parseInt(match[1], 10) : 1
}

/**
 * Group recipes by their family identifier
 *
 * @param recipes - Array of recipes with at least Recipe (name) property
 * @param getRecipeName - Function to extract recipe name from recipe object (defaults to r => r.Recipe)
 * @returns Array of RecipeFamily objects, sorted by family ID
 *
 * @example
 * ```typescript
 * const families = groupRecipesByFamily(recipes)
 * // Returns: [
 * //   { familyId: "BHK-95R-5M", revisions: [...], latestRevision: {...}, revisionCount: 2 },
 * //   { familyId: "WHK-75C-21R-4M", revisions: [...], latestRevision: {...}, revisionCount: 1 }
 * // ]
 * ```
 */
export function groupRecipesByFamily<T extends { Recipe?: string; revision?: number; active?: boolean; updatedAt?: string | Date; familyRevisionCount?: number }>(
  recipes: T[],
  getRecipeName: (recipe: T) => string = (r) => r.Recipe || ''
): RecipeFamily<T>[] {
  const familyMap = new Map<string, T[]>()

  // Group recipes by family ID
  for (const recipe of recipes) {
    const recipeName = getRecipeName(recipe)
    const familyId = getRecipeFamilyId(recipeName)

    if (!familyId) continue

    if (!familyMap.has(familyId)) {
      familyMap.set(familyId, [])
    }
    familyMap.get(familyId)!.push(recipe)
  }

  // Convert to RecipeFamily array
  const families: RecipeFamily<T>[] = []

  for (const [familyId, revisions] of familyMap) {
    // Sort revisions: active first, then by revision number (descending)
    const sortedRevisions = [...revisions].sort((a, b) => {
      // Active recipes first
      if (a.active !== b.active) {
        return a.active ? -1 : 1
      }
      // Then by revision number (descending)
      const revA = a.revision ?? getRecipeRevision(getRecipeName(a))
      const revB = b.revision ?? getRecipeRevision(getRecipeName(b))
      return revB - revA
    })

    // Extract customer code from first recipe
    const latestRevision = sortedRevisions[0]
    if (!latestRevision) continue // Skip if no revisions (shouldn't happen)

    const parsed = parseRecipeString(getRecipeName(latestRevision))

    // Use familyRevisionCount from backend if available (more accurate as it counts all revisions in DB)
    // Fall back to the number of revisions we have locally (which may be incomplete due to pagination)
    const backendCount = latestRevision.familyRevisionCount
    const localCount = sortedRevisions.length
    const revisionCount = backendCount && backendCount > localCount ? backendCount : localCount

    families.push({
      familyId,
      customerCode: parsed.customerCode,
      revisions: sortedRevisions,
      latestRevision,
      revisionCount
    })
  }

  // Sort families by ID
  return families.sort((a, b) => a.familyId.localeCompare(b.familyId))
} 