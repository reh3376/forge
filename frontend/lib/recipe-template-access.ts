// Recipe Template Access Control and Organization
// Supporting customer-specific template management and permissions

import {
  RecipeTemplate,
  CustomerTemplateAccess,
  TemplateSearchParams
} from '@/types/recipe-template'

// Customer context interface
export interface CustomerContext {
  customerId: string
  customerName: string
  isAdmin: boolean
  permissions: CustomerPermission[]
}

export enum CustomerPermission {
  VIEW_OWN_TEMPLATES = 'view_own_templates',
  VIEW_PUBLIC_TEMPLATES = 'view_public_templates',
  CREATE_TEMPLATES = 'create_templates',
  EDIT_OWN_TEMPLATES = 'edit_own_templates',
  DELETE_OWN_TEMPLATES = 'delete_own_templates',
  DUPLICATE_TEMPLATES = 'duplicate_templates',
  SHARE_TEMPLATES = 'share_templates',
  MANAGE_ALL_TEMPLATES = 'manage_all_templates', // Admin only
  VIEW_ALL_CUSTOMERS = 'view_all_customers' // Admin only
}

// Template access operations
export enum TemplateOperation {
  VIEW = 'view',
  EDIT = 'edit',
  DELETE = 'delete',
  DUPLICATE = 'duplicate',
  SHARE = 'share'
}

// Access Control Functions
export function canAccessTemplate(
  template: RecipeTemplate,
  customerContext: CustomerContext,
  operation: TemplateOperation
): boolean {
  // Admin can do everything
  if (customerContext.isAdmin && 
      customerContext.permissions.includes(CustomerPermission.MANAGE_ALL_TEMPLATES)) {
    return true
  }

  // Check if template is public and operation is view
  if (template.isPublic && operation === TemplateOperation.VIEW) {
    return customerContext.permissions.includes(CustomerPermission.VIEW_PUBLIC_TEMPLATES)
  }

  // Check if customer owns the template
  const isOwner = template.customerId === customerContext.customerId

  if (!isOwner) {
    // Non-owners can only view public templates
    return template.isPublic && 
           operation === TemplateOperation.VIEW && 
           customerContext.permissions.includes(CustomerPermission.VIEW_PUBLIC_TEMPLATES)
  }

  // Owner permissions
  switch (operation) {
    case TemplateOperation.VIEW:
      return customerContext.permissions.includes(CustomerPermission.VIEW_OWN_TEMPLATES)
    
    case TemplateOperation.EDIT:
      return customerContext.permissions.includes(CustomerPermission.EDIT_OWN_TEMPLATES)
    
    case TemplateOperation.DELETE:
      return customerContext.permissions.includes(CustomerPermission.DELETE_OWN_TEMPLATES)
    
    case TemplateOperation.DUPLICATE:
      return customerContext.permissions.includes(CustomerPermission.DUPLICATE_TEMPLATES)
    
    case TemplateOperation.SHARE:
      return customerContext.permissions.includes(CustomerPermission.SHARE_TEMPLATES)
    
    default:
      return false
  }
}

export function filterTemplatesByAccess(
  templates: RecipeTemplate[],
  customerContext: CustomerContext,
  operation: TemplateOperation = TemplateOperation.VIEW
): RecipeTemplate[] {
  return templates.filter(template => 
    canAccessTemplate(template, customerContext, operation)
  )
}

export function getCustomerTemplateAccess(
  template: RecipeTemplate,
  customerContext: CustomerContext
): CustomerTemplateAccess {
  const isOwner = template.customerId === customerContext.customerId
  const isAdmin = customerContext.isAdmin && 
                  customerContext.permissions.includes(CustomerPermission.MANAGE_ALL_TEMPLATES)

  return {
    customerId: customerContext.customerId,
    customerName: customerContext.customerName,
    canView: canAccessTemplate(template, customerContext, TemplateOperation.VIEW),
    canEdit: canAccessTemplate(template, customerContext, TemplateOperation.EDIT),
    canDuplicate: canAccessTemplate(template, customerContext, TemplateOperation.DUPLICATE),
    canShare: canAccessTemplate(template, customerContext, TemplateOperation.SHARE),
    isOwner: isOwner || isAdmin
  }
}

// Customer-specific template organization
export function organizeTemplatesByCustomer(
  templates: RecipeTemplate[],
  customerContext: CustomerContext
): {
  ownTemplates: RecipeTemplate[]
  publicTemplates: RecipeTemplate[]
  sharedTemplates: RecipeTemplate[]
} {
  const accessibleTemplates = filterTemplatesByAccess(templates, customerContext)

  const ownTemplates = accessibleTemplates.filter(t => 
    t.customerId === customerContext.customerId
  )

  const publicTemplates = accessibleTemplates.filter(t => 
    t.isPublic && t.customerId !== customerContext.customerId
  )

  const sharedTemplates = accessibleTemplates.filter(t => 
    !t.isPublic && 
    t.customerId !== customerContext.customerId &&
    canAccessTemplate(t, customerContext, TemplateOperation.VIEW)
  )

  return {
    ownTemplates,
    publicTemplates,
    sharedTemplates
  }
}

// Enhanced search with access control
export function createCustomerSearchParams(
  baseParams: TemplateSearchParams,
  customerContext: CustomerContext
): TemplateSearchParams {
  const enhancedParams = { ...baseParams }

  // If not admin, restrict to accessible templates
  if (!customerContext.isAdmin || 
      !customerContext.permissions.includes(CustomerPermission.MANAGE_ALL_TEMPLATES)) {
    
    // Include own templates and public templates
    const allowedCustomerIds = [customerContext.customerId]
    
    if (enhancedParams.customerIds) {
      // Filter to only include allowed customer IDs
      enhancedParams.customerIds = enhancedParams.customerIds.filter(id => 
        allowedCustomerIds.includes(id)
      )
    } else {
      enhancedParams.customerIds = allowedCustomerIds
    }

    // Also include public templates by setting isPublic filter
    if (customerContext.permissions.includes(CustomerPermission.VIEW_PUBLIC_TEMPLATES)) {
      // This will be handled in the filtering logic to include public templates
      // regardless of customer ID
    }
  }

  return enhancedParams
}

// Template sharing utilities
export interface TemplateShareRequest {
  templateId: string
  targetCustomerIds: string[]
  permissions: TemplateSharePermission[]
  expiresAt?: Date
  message?: string
}

export enum TemplateSharePermission {
  VIEW = 'view',
  DUPLICATE = 'duplicate'
}

export interface TemplateShare {
  id: string
  templateId: string
  fromCustomerId: string
  toCustomerId: string
  permissions: TemplateSharePermission[]
  createdAt: Date
  expiresAt?: Date
  isActive: boolean
  message?: string
}

export function canShareTemplate(
  template: RecipeTemplate,
  customerContext: CustomerContext
): boolean {
  return canAccessTemplate(template, customerContext, TemplateOperation.SHARE)
}

export function validateShareRequest(
  shareRequest: TemplateShareRequest,
  template: RecipeTemplate,
  customerContext: CustomerContext
): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // Check if user can share the template
  if (!canShareTemplate(template, customerContext)) {
    errors.push('You do not have permission to share this template')
  }

  // Validate target customers
  if (!shareRequest.targetCustomerIds.length) {
    errors.push('At least one target customer must be specified')
  }

  // Check if trying to share with self
  if (shareRequest.targetCustomerIds.includes(customerContext.customerId)) {
    errors.push('Cannot share template with yourself')
  }

  // Validate permissions
  if (!shareRequest.permissions.length) {
    errors.push('At least one permission must be specified')
  }

  // Validate expiration date
  if (shareRequest.expiresAt && shareRequest.expiresAt <= new Date()) {
    errors.push('Expiration date must be in the future')
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

// Customer template statistics
export interface CustomerTemplateStats {
  customerId: string
  customerName: string
  totalTemplates: number
  publicTemplates: number
  privateTemplates: number
  sharedTemplates: number
  favoriteTemplates: number
  recentlyUsedTemplates: number
  templatesByWhiskeyType: Record<string, number>
  templatesByComplexity: Record<string, number>
  averageRating: number
  totalUseCount: number
}

export function calculateCustomerTemplateStats(
  templates: RecipeTemplate[],
  customerContext: CustomerContext
): CustomerTemplateStats {
  const customerTemplates = templates.filter(t => 
    t.customerId === customerContext.customerId
  )

  const publicTemplates = customerTemplates.filter(t => t.isPublic)
  const privateTemplates = customerTemplates.filter(t => !t.isPublic)
  const favoriteTemplates = customerTemplates.filter(t => t.isFavorite)
  
  // Recently used (within last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const recentlyUsedTemplates = customerTemplates.filter(t => 
    t.lastUsed && new Date(t.lastUsed) > thirtyDaysAgo
  )

  // Group by whiskey type
  const templatesByWhiskeyType = customerTemplates.reduce((acc, template) => {
    acc[template.whiskeyType] = (acc[template.whiskeyType] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Group by complexity
  const templatesByComplexity = customerTemplates.reduce((acc, template) => {
    acc[template.complexity] = (acc[template.complexity] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Calculate average rating
  const templatesWithRatings = customerTemplates.filter(t => t.averageRating)
  const averageRating = templatesWithRatings.length > 0
    ? templatesWithRatings.reduce((sum, t) => sum + (t.averageRating || 0), 0) / templatesWithRatings.length
    : 0

  // Calculate total use count
  const totalUseCount = customerTemplates.reduce((sum, t) => sum + t.useCount, 0)

  return {
    customerId: customerContext.customerId,
    customerName: customerContext.customerName,
    totalTemplates: customerTemplates.length,
    publicTemplates: publicTemplates.length,
    privateTemplates: privateTemplates.length,
    sharedTemplates: 0, // Would need to calculate from shares
    favoriteTemplates: favoriteTemplates.length,
    recentlyUsedTemplates: recentlyUsedTemplates.length,
    templatesByWhiskeyType,
    templatesByComplexity,
    averageRating,
    totalUseCount
  }
}

// Default customer permissions
export function getDefaultCustomerPermissions(): CustomerPermission[] {
  return [
    CustomerPermission.VIEW_OWN_TEMPLATES,
    CustomerPermission.VIEW_PUBLIC_TEMPLATES,
    CustomerPermission.CREATE_TEMPLATES,
    CustomerPermission.EDIT_OWN_TEMPLATES,
    CustomerPermission.DELETE_OWN_TEMPLATES,
    CustomerPermission.DUPLICATE_TEMPLATES,
    CustomerPermission.SHARE_TEMPLATES
  ]
}

export function getAdminCustomerPermissions(): CustomerPermission[] {
  return [
    ...getDefaultCustomerPermissions(),
    CustomerPermission.MANAGE_ALL_TEMPLATES,
    CustomerPermission.VIEW_ALL_CUSTOMERS
  ]
}

// Customer context creation helper
export function createCustomerContext(
  customerId: string,
  customerName: string,
  isAdmin = false,
  customPermissions?: CustomerPermission[]
): CustomerContext {
  const permissions = customPermissions || 
    (isAdmin ? getAdminCustomerPermissions() : getDefaultCustomerPermissions())

  return {
    customerId,
    customerName,
    isAdmin,
    permissions
  }
}

// Export access control utilities
export const TemplateAccessUtils = {
  canAccessTemplate,
  filterTemplatesByAccess,
  getCustomerTemplateAccess,
  organizeTemplatesByCustomer,
  createCustomerSearchParams,
  canShareTemplate,
  validateShareRequest,
  calculateCustomerTemplateStats,
  getDefaultCustomerPermissions,
  getAdminCustomerPermissions,
  createCustomerContext
} 