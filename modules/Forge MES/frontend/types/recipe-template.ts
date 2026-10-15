// Recipe Template Data Model Types
// Supporting the Recipe Template Library and Search functionality

import { RecipeDetailsData } from '@/components/recipe/recipe-details-step'
import { RecipeBOMData } from '@/components/recipe/recipe-bom-step'
import { RecipeParametersData } from '@/components/recipe/recipe-parameters-step'
import { RecipeMashingData } from '@/components/recipe/recipe-mashing-step'

// Core Template Interfaces
export interface RecipeTemplate {
  id: string
  name: string
  description: string
  createdAt: Date
  updatedAt: Date
  createdBy: string
  customerId?: string
  customerName?: string
  whiskeyType: string
  complexity: ComplexityLevel
  tags: TemplateTag[]
  mashBillPattern: string // e.g., "75-21-00-04"
  mashBill: MashBillComponent[]
  isPublic: boolean
  isFavorite: boolean
  useCount: number
  lastUsed?: Date
  revisions: TemplateRevision[]
  
  // Recipe data from wizard steps
  details: RecipeDetailsData
  bom: RecipeBOMData
  parameters: RecipeParametersData
  mashing: RecipeMashingData
  
  // Calculated fields
  estimatedCost?: number
  estimatedYield?: number
  averageRating?: number
  totalRatings?: number
}

// Mash Bill Components
export interface MashBillComponent {
  ingredientId: string
  ingredientName: string
  ingredientType: IngredientType
  percentage: number
  order: number
}

export enum IngredientType {
  CORN = 'corn',
  RYE = 'rye',
  WHEAT = 'wheat',
  MALTED_BARLEY = 'malted_barley',
  MALTED_CORN = 'malted_corn',
  MALTED_RYE = 'malted_rye',
  MALTED_WHEAT = 'malted_wheat',
  OTHER = 'other'
}

// Template Tags and Categories
export interface TemplateTag {
  id: string
  name: string
  category: TagCategory
  color?: string
}

export enum TagCategory {
  FLAVOR_PROFILE = 'flavor_profile',
  PRODUCTION_METHOD = 'production_method',
  SPECIAL_TECHNIQUE = 'special_technique',
  CUSTOMER_SPECIFIC = 'customer_specific',
  DIFFICULTY = 'difficulty',
  SEASON = 'season',
  EQUIPMENT = 'equipment'
}

// Complexity Levels
export enum ComplexityLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert'
}

// Template Revisions
export interface TemplateRevision {
  id: string
  templateId: string
  version: number
  versionName: string // e.g., "R01", "R02"
  changes: string
  createdAt: Date
  createdBy: string
  snapshot: Partial<RecipeTemplate>
}

// Search and Filter Types
export interface TemplateSearchParams {
  query?: string
  whiskeyTypes?: string[]
  tags?: string[]
  tagCategories?: TagCategory[]
  complexity?: ComplexityLevel[]
  customerId?: string
  customerIds?: string[]
  createdBy?: string
  dateRange?: DateRange
  mashBillPattern?: string
  ingredientTypes?: IngredientType[]
  isPublic?: boolean
  isFavorite?: boolean
  minRating?: number
  sortBy?: TemplateSortBy
  sortOrder?: SortOrder
  limit?: number
  offset?: number
}

export interface DateRange {
  startDate?: Date
  endDate?: Date
}

export enum TemplateSortBy {
  NAME = 'name',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  USE_COUNT = 'useCount',
  LAST_USED = 'lastUsed',
  RATING = 'averageRating',
  COMPLEXITY = 'complexity',
  CUSTOMER = 'customerName'
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc'
}

// Mash Bill Pattern Recognition
export interface MashBillPattern {
  pattern: string // e.g., "75-21-00-04"
  components: {
    corn?: number
    rye?: number
    wheat?: number
    maltedBarley?: number
    other?: number
  }
  isValid: boolean
  totalPercentage: number
}

// Template Categories for Organization
export interface TemplateCategory {
  id: string
  name: string
  description: string
  parentId?: string
  children?: TemplateCategory[]
  templateCount: number
}

// Customer-specific Template Organization
export interface CustomerTemplateAccess {
  customerId: string
  customerName: string
  canView: boolean
  canEdit: boolean
  canDuplicate: boolean
  canShare: boolean
  isOwner: boolean
}

// Template Search Results
export interface TemplateSearchResult {
  templates: RecipeTemplate[]
  totalCount: number
  facets: SearchFacets
  suggestions?: string[]
}

export interface SearchFacets {
  whiskeyTypes: FacetCount[]
  tags: FacetCount[]
  complexity: FacetCount[]
  customers: FacetCount[]
  ingredientTypes: FacetCount[]
}

export interface FacetCount {
  value: string
  label: string
  count: number
}

// Template Comparison
export interface TemplateComparison {
  templates: RecipeTemplate[]
  differences: ComparisonDifference[]
  similarities: ComparisonSimilarity[]
}

export interface ComparisonDifference {
  field: string
  fieldLabel: string
  values: { templateId: string; value: unknown }[]
}

export interface ComparisonSimilarity {
  field: string
  fieldLabel: string
  value: unknown
  confidence: number
}

// Template Import/Export
export interface TemplateExportData {
  templates: RecipeTemplate[]
  metadata: {
    exportedAt: Date
    exportedBy: string
    version: string
    totalCount: number
  }
}

export interface TemplateImportResult {
  imported: number
  skipped: number
  errors: TemplateImportError[]
}

export interface TemplateImportError {
  templateName: string
  error: string
  lineNumber?: number
}

// Template Suggestions
export interface TemplateSuggestion {
  template: RecipeTemplate
  reason: SuggestionReason
  confidence: number
  matchingCriteria: string[]
}

export enum SuggestionReason {
  SIMILAR_MASH_BILL = 'similar_mash_bill',
  SAME_WHISKEY_TYPE = 'same_whiskey_type',
  SAME_CUSTOMER = 'same_customer',
  POPULAR_CHOICE = 'popular_choice',
  RECENTLY_USED = 'recently_used',
  HIGHLY_RATED = 'highly_rated'
}

// Utility Functions Types
export type MashBillPatternParser = (pattern: string) => MashBillPattern
export type TemplateValidator = (template: Partial<RecipeTemplate>) => ValidationResult

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface ValidationError {
  field: string
  message: string
  code: string
}

export interface ValidationWarning {
  field: string
  message: string
  code: string
}

// Template Library State Management
export interface TemplateLibraryState {
  templates: RecipeTemplate[]
  searchResults: TemplateSearchResult | null
  currentSearch: TemplateSearchParams
  selectedTemplates: string[]
  favorites: string[]
  recentlyUsed: string[]
  categories: TemplateCategory[]
  tags: TemplateTag[]
  isLoading: boolean
  error: string | null
}

// API Response Types
export interface TemplateApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedTemplateResponse {
  templates: RecipeTemplate[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
} 