// Recipe Template Utility Functions
// Supporting categorization, tagging, validation, and organization

import {
  RecipeTemplate,
  MashBillPattern,
  MashBillComponent,
  IngredientType,
  ComplexityLevel,
  TemplateTag,
  TagCategory,
  TemplateSearchParams,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  TemplateSuggestion,
  SuggestionReason
} from '@/types/recipe-template'

// Mash Bill Pattern Parsing and Recognition
export function parseMashBillPattern(pattern: string): MashBillPattern {
  const cleanPattern = pattern.trim().replace(/\s+/g, '')
  
  // Expected format: "75-21-00-04" (corn-rye-wheat-malted_barley)
  const parts = cleanPattern.split('-')
  
  if (parts.length !== 4) {
    return {
      pattern: cleanPattern,
      components: {},
      isValid: false,
      totalPercentage: 0
    }
  }

  const numbers = parts.map(p => parseInt(p, 10))
  
  if (numbers.some(n => isNaN(n)) || numbers.length !== 4) {
    return {
      pattern: cleanPattern,
      components: {},
      isValid: false,
      totalPercentage: 0
    }
  }

  const corn = numbers[0]!
  const rye = numbers[1]!
  const wheat = numbers[2]!
  const maltedBarley = numbers[3]!
  const totalPercentage = corn + rye + wheat + maltedBarley
  
  const components: { corn?: number; rye?: number; wheat?: number; maltedBarley?: number } = {}
  if (corn > 0) components.corn = corn
  if (rye > 0) components.rye = rye
  if (wheat > 0) components.wheat = wheat
  if (maltedBarley > 0) components.maltedBarley = maltedBarley
  
  return {
    pattern: cleanPattern,
    components,
    isValid: totalPercentage === 100,
    totalPercentage
  }
}

export function generateMashBillPattern(components: MashBillComponent[]): string {
  // Sort by ingredient type in standard order
  const typeOrder = [
    IngredientType.CORN,
    IngredientType.RYE,
    IngredientType.WHEAT,
    IngredientType.MALTED_BARLEY
  ]

  const percentages = typeOrder.map(type => {
    const component = components.find(c => c.ingredientType === type)
    return component ? Math.round(component.percentage) : 0
  })

  return percentages.join('-')
}

export function isSimilarMashBill(pattern1: string, pattern2: string, tolerance = 5): boolean {
  const parsed1 = parseMashBillPattern(pattern1)
  const parsed2 = parseMashBillPattern(pattern2)

  if (!parsed1.isValid || !parsed2.isValid) {
    return false
  }

  const components1 = parsed1.components
  const components2 = parsed2.components

  const types: (keyof typeof components1)[] = ['corn', 'rye', 'wheat', 'maltedBarley']
  
  return types.every(type => {
    const val1 = components1[type] || 0
    const val2 = components2[type] || 0
    return Math.abs(val1 - val2) <= tolerance
  })
}

// Template Categorization
export function categorizeTemplate(template: RecipeTemplate): TemplateTag[] {
  const tags: TemplateTag[] = []

  // Whiskey type categorization
  tags.push({
    id: `whiskey-${template.whiskeyType.toLowerCase()}`,
    name: template.whiskeyType,
    category: TagCategory.FLAVOR_PROFILE
  })

  // Complexity categorization
  tags.push({
    id: `complexity-${template.complexity}`,
    name: template.complexity.charAt(0).toUpperCase() + template.complexity.slice(1),
    category: TagCategory.DIFFICULTY
  })

  // Customer-specific categorization
  if (template.customerId && template.customerName) {
    tags.push({
      id: `customer-${template.customerId}`,
      name: template.customerName,
      category: TagCategory.CUSTOMER_SPECIFIC
    })
  }

  // Mash bill pattern categorization
  const mashBill = parseMashBillPattern(template.mashBillPattern)
  if (mashBill.isValid) {
    // High rye (>20%)
    if ((mashBill.components.rye || 0) > 20) {
      tags.push({
        id: 'high-rye',
        name: 'High Rye',
        category: TagCategory.FLAVOR_PROFILE
      })
    }

    // Wheated (>10% wheat)
    if ((mashBill.components.wheat || 0) > 10) {
      tags.push({
        id: 'wheated',
        name: 'Wheated',
        category: TagCategory.FLAVOR_PROFILE
      })
    }

    // High corn (>80%)
    if ((mashBill.components.corn || 0) > 80) {
      tags.push({
        id: 'high-corn',
        name: 'High Corn',
        category: TagCategory.FLAVOR_PROFILE
      })
    }
  }

  // Production method tags based on parameters
  if (template.parameters?.parameters) {
    const hasDoubleDistillation = template.parameters.parameters.some(p => 
      p.name?.toLowerCase().includes('double') || p.name?.toLowerCase().includes('distillation')
    )
    
    if (hasDoubleDistillation) {
      tags.push({
        id: 'double-distillation',
        name: 'Double Distillation',
        category: TagCategory.PRODUCTION_METHOD
      })
    }
  }

  return tags
}

// Template Validation
export function validateTemplate(template: Partial<RecipeTemplate>): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  // Required fields validation
  if (!template.name?.trim()) {
    errors.push({
      field: 'name',
      message: 'Template name is required',
      code: 'REQUIRED_FIELD'
    })
  }

  if (!template.whiskeyType) {
    errors.push({
      field: 'whiskeyType',
      message: 'Whiskey type is required',
      code: 'REQUIRED_FIELD'
    })
  }

  if (!template.mashBillPattern) {
    errors.push({
      field: 'mashBillPattern',
      message: 'Mash bill pattern is required',
      code: 'REQUIRED_FIELD'
    })
  } else {
    // Validate mash bill pattern
    const mashBill = parseMashBillPattern(template.mashBillPattern)
    if (!mashBill.isValid) {
      errors.push({
        field: 'mashBillPattern',
        message: 'Invalid mash bill pattern format or percentages do not sum to 100',
        code: 'INVALID_MASH_BILL'
      })
    }
  }

  // Validate complexity level
  if (template.complexity && !Object.values(ComplexityLevel).includes(template.complexity)) {
    errors.push({
      field: 'complexity',
      message: 'Invalid complexity level',
      code: 'INVALID_COMPLEXITY'
    })
  }

  // Validate recipe details
  if (template.details) {
    if (!template.details.recipeName?.trim()) {
      errors.push({
        field: 'details.recipeName',
        message: 'Recipe name in details is required',
        code: 'REQUIRED_FIELD'
      })
    }

    if (template.details.cooksPerFermenter < 1 || template.details.cooksPerFermenter > 10) {
      errors.push({
        field: 'details.cooksPerFermenter',
        message: 'Cooks per fermenter must be between 1 and 10',
        code: 'INVALID_RANGE'
      })
    }
  }

  // Validate BOM
  if (template.bom?.ingredients && template.bom.ingredients.length === 0) {
    warnings.push({
      field: 'bom.ingredients',
      message: 'No ingredients specified in bill of materials',
      code: 'EMPTY_BOM'
    })
  }

  // Validate parameters
  if (template.parameters?.parameters && template.parameters.parameters.length === 0) {
    warnings.push({
      field: 'parameters.parameters',
      message: 'No parameters specified',
      code: 'EMPTY_PARAMETERS'
    })
  }

  // Validate mashing protocol
  if (template.mashing?.mashingSteps && template.mashing.mashingSteps.length === 0) {
    warnings.push({
      field: 'mashing.mashingSteps',
      message: 'No mashing steps specified',
      code: 'EMPTY_MASHING'
    })
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

// Template Search and Filtering
export function filterTemplates(
  templates: RecipeTemplate[],
  searchParams: TemplateSearchParams
): RecipeTemplate[] {
  return templates.filter(template => {
    // Text search
    if (searchParams.query) {
      const query = searchParams.query.toLowerCase()
      const searchableText = [
        template.name,
        template.description,
        template.customerName,
        template.whiskeyType,
        template.mashBillPattern,
        ...template.tags.map(tag => tag.name)
      ].join(' ').toLowerCase()

      if (!searchableText.includes(query)) {
        return false
      }
    }

    // Whiskey type filter
    if (searchParams.whiskeyTypes?.length && 
        !searchParams.whiskeyTypes.includes(template.whiskeyType)) {
      return false
    }

    // Complexity filter
    if (searchParams.complexity?.length && 
        !searchParams.complexity.includes(template.complexity)) {
      return false
    }

    // Customer filter
    if (searchParams.customerId && template.customerId !== searchParams.customerId) {
      return false
    }

    if (searchParams.customerIds?.length && 
        (!template.customerId || !searchParams.customerIds.includes(template.customerId))) {
      return false
    }

    // Tags filter
    if (searchParams.tags?.length) {
      const templateTagNames = template.tags.map(tag => tag.name)
      if (!searchParams.tags.some(tag => templateTagNames.includes(tag))) {
        return false
      }
    }

    // Tag categories filter
    if (searchParams.tagCategories?.length) {
      const templateTagCategories = template.tags.map(tag => tag.category)
      if (!searchParams.tagCategories.some(category => templateTagCategories.includes(category))) {
        return false
      }
    }

    // Mash bill pattern filter
    if (searchParams.mashBillPattern) {
      if (!isSimilarMashBill(template.mashBillPattern, searchParams.mashBillPattern)) {
        return false
      }
    }

    // Public/private filter
    if (searchParams.isPublic !== undefined && template.isPublic !== searchParams.isPublic) {
      return false
    }

    // Favorites filter
    if (searchParams.isFavorite !== undefined && template.isFavorite !== searchParams.isFavorite) {
      return false
    }

    // Rating filter
    if (searchParams.minRating !== undefined && 
        (!template.averageRating || template.averageRating < searchParams.minRating)) {
      return false
    }

    // Date range filter
    if (searchParams.dateRange) {
      const createdAt = new Date(template.createdAt)
      if (searchParams.dateRange.startDate && createdAt < searchParams.dateRange.startDate) {
        return false
      }
      if (searchParams.dateRange.endDate && createdAt > searchParams.dateRange.endDate) {
        return false
      }
    }

    return true
  })
}

// Template Suggestions
export function generateTemplateSuggestions(
  templates: RecipeTemplate[],
  criteria: {
    whiskeyType?: string
    customerId?: string
    mashBillPattern?: string
    recentlyUsed?: string[]
    favorites?: string[]
  }
): TemplateSuggestion[] {
  const suggestions: TemplateSuggestion[] = []

  templates.forEach(template => {
    const matchingCriteria: string[] = []
    let confidence = 0

    // Same whiskey type
    if (criteria.whiskeyType && template.whiskeyType === criteria.whiskeyType) {
      matchingCriteria.push('Same whiskey type')
      confidence += 30
    }

    // Same customer
    if (criteria.customerId && template.customerId === criteria.customerId) {
      matchingCriteria.push('Same customer')
      confidence += 25
    }

    // Similar mash bill
    if (criteria.mashBillPattern && 
        isSimilarMashBill(template.mashBillPattern, criteria.mashBillPattern)) {
      matchingCriteria.push('Similar mash bill pattern')
      confidence += 35
    }

    // Recently used
    if (criteria.recentlyUsed?.includes(template.id)) {
      matchingCriteria.push('Recently used')
      confidence += 15
    }

    // Favorites
    if (criteria.favorites?.includes(template.id)) {
      matchingCriteria.push('Marked as favorite')
      confidence += 20
    }

    // High rating
    if (template.averageRating && template.averageRating >= 4.0) {
      matchingCriteria.push('Highly rated')
      confidence += 10
    }

    // Popular (high use count)
    if (template.useCount > 10) {
      matchingCriteria.push('Popular choice')
      confidence += 10
    }

    if (matchingCriteria.length > 0) {
      let reason = SuggestionReason.POPULAR_CHOICE
      
      if (criteria.mashBillPattern && 
          isSimilarMashBill(template.mashBillPattern, criteria.mashBillPattern)) {
        reason = SuggestionReason.SIMILAR_MASH_BILL
      } else if (criteria.whiskeyType && template.whiskeyType === criteria.whiskeyType) {
        reason = SuggestionReason.SAME_WHISKEY_TYPE
      } else if (criteria.customerId && template.customerId === criteria.customerId) {
        reason = SuggestionReason.SAME_CUSTOMER
      } else if (criteria.recentlyUsed?.includes(template.id)) {
        reason = SuggestionReason.RECENTLY_USED
      } else if (criteria.favorites?.includes(template.id)) {
        reason = SuggestionReason.HIGHLY_RATED
      }

      suggestions.push({
        template,
        reason,
        confidence: Math.min(100, confidence),
        matchingCriteria
      })
    }
  })

  // Sort by confidence and return top suggestions
  return suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10)
}

// Template Organization Helpers
export function groupTemplatesByCustomer(templates: RecipeTemplate[]): Record<string, RecipeTemplate[]> {
  return templates.reduce((groups, template) => {
    const key = template.customerName || 'Unknown Customer'
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(template)
    return groups
  }, {} as Record<string, RecipeTemplate[]>)
}

export function groupTemplatesByWhiskeyType(templates: RecipeTemplate[]): Record<string, RecipeTemplate[]> {
  return templates.reduce((groups, template) => {
    const key = template.whiskeyType
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(template)
    return groups
  }, {} as Record<string, RecipeTemplate[]>)
}

export function groupTemplatesByComplexity(templates: RecipeTemplate[]): Record<string, RecipeTemplate[]> {
  return templates.reduce((groups, template) => {
    const key = template.complexity
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(template)
    return groups
  }, {} as Record<string, RecipeTemplate[]>)
}

// Template Comparison Utilities
export function compareTemplates(template1: RecipeTemplate, template2: RecipeTemplate): {
  similarities: string[]
  differences: string[]
} {
  const similarities: string[] = []
  const differences: string[] = []

  // Compare basic properties
  if (template1.whiskeyType === template2.whiskeyType) {
    similarities.push('Same whiskey type')
  } else {
    differences.push('Different whiskey types')
  }

  if (template1.complexity === template2.complexity) {
    similarities.push('Same complexity level')
  } else {
    differences.push('Different complexity levels')
  }

  if (template1.customerId === template2.customerId) {
    similarities.push('Same customer')
  } else {
    differences.push('Different customers')
  }

  // Compare mash bills
  if (isSimilarMashBill(template1.mashBillPattern, template2.mashBillPattern)) {
    similarities.push('Similar mash bill patterns')
  } else {
    differences.push('Different mash bill patterns')
  }

  return { similarities, differences }
}

// Export utility functions
export const TemplateUtils = {
  parseMashBillPattern,
  generateMashBillPattern,
  isSimilarMashBill,
  categorizeTemplate,
  validateTemplate,
  filterTemplates,
  generateTemplateSuggestions,
  groupTemplatesByCustomer,
  groupTemplatesByWhiskeyType,
  groupTemplatesByComplexity,
  compareTemplates
} 