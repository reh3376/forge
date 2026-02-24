import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { removeRunPrefix } from "./recipe-utils"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format recipe name for display in production order views
 * Extracts meaningful parts from recipe names like "WHK-74-18-00-08-v001" or "JBM-75-21-00-04-v01"
 * to show "WHK-74-18-00-08" (brand-corn%-rye%-wheat%-malt%) or returns the full name if it doesn't match the pattern
 * Ignores RUN#- prefixes where # is a single digit (e.g., "RUN1-WHK-74-18-00-08-v001")
 */
export function formatRecipeName(recipeName?: string | null): string {
  if (!recipeName) return 'Unknown Recipe'
  
  // Remove RUN#- prefix if present (where # is a single digit)
  const cleanedRecipeName = removeRunPrefix(recipeName)
  
  // Extract meaningful parts from recipe name like "WHK-74-18-00-08-v001"
  // Format: BRAND-CORN%-RYE%-WHEAT%-MALT%-VERSION
  const parts = cleanedRecipeName.split('-')
  if (parts.length >= 5) {
    // Return brand and all grain percentages: WHK-74-18-00-08
    return `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}-${parts[4]}`
  }
  return recipeName
}

/**
 * Get the mash bill from a recipe name
 * Extracts the mash bill portion from recipe names like "WHK-74-18-00-08-v001"
 * to show "74-18-00-08" (corn%-wheat%/rye%-barley%-malt%)
 * Ignores RUN#- prefixes where # is a single digit (e.g., "RUN1-WHK-74-18-00-08-v001")
 */
export function getMashBillFromRecipe(recipeName?: string | null): string {
  if (!recipeName) return 'Unknown'
  
  // Remove RUN#- prefix if present (where # is a single digit)
  const cleanedRecipeName = removeRunPrefix(recipeName)
  
  // Extract mash bill from recipe name like "WHK-74-18-00-08-v001"
  // Format: BRAND-CORN%-WHEAT%/RYE%-BARLEY%-MALT%-VERSION
  const parts = cleanedRecipeName.split('-')
  if (parts.length >= 5) {
    // Return the grain percentages: 74-18-00-08
    return `${parts[1]}-${parts[2]}-${parts[3]}-${parts[4]}`
  }
  return recipeName
}
