'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageContainer } from '@/components/ui/layout'
import { RouteGuard } from '@/components/auth/route-guard'
import { ManufacturingPermission } from '@/lib/auth-config'
import { Plus, Edit, Trash2, Search, Filter, Settings, ChevronLeft, ChevronRight } from 'lucide-react'
import { recipeParameterClient, RecipeParameter, CreateRecipeParameterInput, UpdateRecipeParameterInput, Operation, Units, ParameterCategory } from '@/lib/api/recipe-parameter-client'

const SETPOINT_TYPES = [
  { value: 'Numeric', label: 'Numeric' },
  { value: 'Boolean', label: 'Boolean' },
  { value: 'Text', label: 'Text' }
]

const CLASS_NAMES = [
  { value: 'Mashing01', label: 'Mashing 01' },
  { value: 'Fermentation01', label: 'Fermentation 01' },
  { value: 'Distillation01', label: 'Distillation 01' },
  { value: 'Processing01', label: 'Processing 01' }
]

const PARAMETER_CATEGORIES: { value: ParameterCategory; label: string }[] = [
  { value: 'Input', label: 'Input' },
  { value: 'Output', label: 'Output' },
  { value: 'Calculated', label: 'Calculated' },
  { value: 'MashingActual', label: 'Mashing Actual' },
  { value: 'ProcessingActual', label: 'Processing Actual' }
]

export default function RecipeParametersPage() {
  const [parameters, setParameters] = useState<RecipeParameter[]>([])
  const [operations, setOperations] = useState<Operation[]>([])
  const [units, setUnits] = useState<Units[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [hasPreviousPage, setHasPreviousPage] = useState(false)
  const pageSize = 20

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [classNameFilter, setClassNameFilter] = useState<string>('all')
  const [operationFilter, setOperationFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingParameter, setEditingParameter] = useState<RecipeParameter | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState<CreateRecipeParameterInput>({
    recipeParamName: '',
    recipeParamDescription: '',
    description: '',
    className: '',
    active: true,
    required: false,
    recipeSetpointType: 'Numeric',
    recipeNumericalSetpoint: 0,
    recipeSetpointBooleanValue: false,
    recipeSetpointLowerLimit: 0,
    recipeSetpointUpperLimit: 100,
    parameterCategory: 'Input',
    unitsId: '',
    operationId: '',
    isClassDefinition: true
  })

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Build filter
      const filter: Record<string, unknown> = {}
      if (activeFilter !== 'all') {
        filter['active'] = activeFilter === 'active'
      }
      if (classNameFilter !== 'all') {
        filter['className'] = classNameFilter
      }
      if (operationFilter !== 'all') {
        filter['operationId'] = operationFilter
      }
      if (categoryFilter !== 'all') {
        filter['parameterCategory'] = { equals: categoryFilter }
      }
      if (searchTerm) {
        filter['recipeParamName'] = {
          contains: searchTerm,
          mode: 'Insensitive'
        }
      }

      const [parametersResult, operationsResult, unitsResult] = await Promise.all([
        recipeParameterClient.getRecipeParameters(
          { skip: (currentPage - 1) * pageSize, take: pageSize },
          filter
        ),
        recipeParameterClient.getOperations(),
        recipeParameterClient.getUnits()
      ])

      setParameters(parametersResult.recipeParameters)
      setTotalCount(parametersResult.totalCount)
      setHasNextPage(parametersResult.hasNextPage)
      setHasPreviousPage(parametersResult.hasPreviousPage)
      setOperations(operationsResult)
      setUnits(unitsResult)
    } catch (err) {
      console.error('Error loading data:', err)
      setError('Failed to load recipe parameters')
      showNotification('error', 'Failed to load recipe parameters')
    } finally {
      setLoading(false)
    }
  }, [currentPage, searchTerm, activeFilter, classNameFilter, operationFilter, categoryFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreate = async () => {
    try {
      await recipeParameterClient.createRecipeParameter(formData)
      showNotification('success', 'Recipe parameter created successfully')
      setIsCreateDialogOpen(false)
      resetForm()
      loadData()
    } catch (err) {
      console.error('Error creating parameter:', err)
      showNotification('error', 'Failed to create recipe parameter')
    }
  }

  const handleEdit = async () => {
    if (!editingParameter) return

    try {
      const updateData: UpdateRecipeParameterInput = { ...formData }
      await recipeParameterClient.updateRecipeParameter(editingParameter.id, updateData)
      showNotification('success', 'Recipe parameter updated successfully')
      setIsEditDialogOpen(false)
      setEditingParameter(null)
      resetForm()
      loadData()
    } catch (err) {
      console.error('Error updating parameter:', err)
      showNotification('error', 'Failed to update recipe parameter')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await recipeParameterClient.deleteRecipeParameter(id)
      showNotification('success', 'Recipe parameter deleted successfully')
      setDeleteConfirmId(null)
      loadData()
    } catch (err) {
      console.error('Error deleting parameter:', err)
      showNotification('error', 'Failed to delete recipe parameter')
    }
  }

  const resetForm = () => {
    setFormData({
      recipeParamName: '',
      recipeParamDescription: '',
      description: '',
      className: '',
      active: true,
      required: false,
      recipeSetpointType: 'Numeric',
      recipeNumericalSetpoint: 0,
      recipeSetpointBooleanValue: false,
      recipeSetpointLowerLimit: 0,
      recipeSetpointUpperLimit: 100,
      parameterCategory: 'Input',
      unitsId: '',
      operationId: '',
      isClassDefinition: true
    })
  }

  const openEditDialog = (parameter: RecipeParameter) => {
    setEditingParameter(parameter)
    setFormData({
      recipeParamName: parameter.recipeParamName,
      recipeParamDescription: parameter.recipeParamDescription || '',
      description: parameter.description || '',
      className: parameter.className,
      active: parameter.active,
      required: parameter.required || false,
      recipeSetpointType: parameter.recipeSetpointType || 'Numeric',
      recipeNumericalSetpoint: parameter.recipeNumericalSetpoint || 0,
      recipeSetpointBooleanValue: parameter.recipeSetpointBooleanValue || false,
      recipeSetpointLowerLimit: parameter.recipeSetpointLowerLimit || 0,
      recipeSetpointUpperLimit: parameter.recipeSetpointUpperLimit || 100,
      parameterCategory: parameter.parameterCategory || 'Input',
      unitsId: parameter.units?.id || '',
      operationId: parameter.operation?.id || '',
      isClassDefinition: true
    })
    setIsEditDialogOpen(true)
  }

  const formatSetpointValue = (parameter: RecipeParameter) => {
    switch (parameter.recipeSetpointType) {
      case 'Boolean':
        return parameter.recipeSetpointBooleanValue ? 'True' : 'False'
      case 'Numeric':
        return `${parameter.recipeNumericalSetpoint || 0}${parameter.units?.abbreviation ? ` ${parameter.units.abbreviation}` : ''}`
      default:
        return 'N/A'
    }
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  if (loading && parameters.length === 0) {
    return (
      <RouteGuard 
        config={{
          requiresAuth: true,
          requiredPermissions: [ManufacturingPermission.SYSTEM_SETTINGS]
        }}
      >
        <PageContainer>
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading recipe parameters...</p>
            </div>
          </div>
        </PageContainer>
      </RouteGuard>
    )
  }

  return (
    <RouteGuard 
      config={{
        requiresAuth: true,
        requiredPermissions: [ManufacturingPermission.SYSTEM_SETTINGS]
      }}
    >
      <PageContainer>
        <div className="space-y-6">
          {/* Notification */}
          {notification && (
            <div className={`p-4 rounded-md ${notification.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {notification.message}
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Master Recipe Parameters</h1>
              <p className="text-muted-foreground">
                Manage master recipe parameters and setpoints (class definitions only)
              </p>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Parameter
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Recipe Parameter</DialogTitle>
                  <DialogDescription>
                    Add a new recipe parameter to the master configuration
                  </DialogDescription>
                </DialogHeader>
                <ParameterForm
                  formData={formData}
                  setFormData={setFormData}
                  operations={operations}
                  units={units}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate}>Create Parameter</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="search">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search"
                      placeholder="Search parameters..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="active-filter">Status</Label>
                  <Select value={activeFilter} onValueChange={setActiveFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="class-filter">Class</Label>
                  <Select value={classNameFilter} onValueChange={setClassNameFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Classes</SelectItem>
                      {CLASS_NAMES.map((className) => (
                        <SelectItem key={className.value} value={className.value}>
                          {className.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="operation-filter">Operation</Label>
                  <Select value={operationFilter} onValueChange={setOperationFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Operations</SelectItem>
                      {operations.map((operation) => (
                        <SelectItem key={operation.id} value={operation.id}>
                          {operation.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category-filter">Category</Label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {PARAMETER_CATEGORIES.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Parameters Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Recipe Parameters ({totalCount})
              </CardTitle>
              <CardDescription>
                Master recipe parameters and their configurations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error ? (
                <div className="text-center py-8">
                  <p className="text-destructive">{error}</p>
                  <Button onClick={loadData} className="mt-4">
                    Retry
                  </Button>
                </div>
              ) : parameters.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No recipe parameters found</p>
                  <Button onClick={() => setIsCreateDialogOpen(true)} className="mt-4">
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Parameter
                  </Button>
                </div>
              ) : (
                <>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Operation</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Setpoint</TableHead>
                          <TableHead>Range</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Required</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parameters.map((parameter) => (
                          <TableRow key={parameter.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{parameter.recipeParamName}</div>
                                {parameter.recipeParamDescription && (
                                  <div className="text-sm text-muted-foreground">
                                    {parameter.recipeParamDescription}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {CLASS_NAMES.find(c => c.value === parameter.className)?.label || parameter.className}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {parameter.parameterCategory ? (
                                <Badge variant="secondary">
                                  {PARAMETER_CATEGORIES.find(c => c.value === parameter.parameterCategory)?.label || parameter.parameterCategory}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {parameter.operation?.name || 'N/A'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {parameter.recipeSetpointType}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {formatSetpointValue(parameter)}
                            </TableCell>
                            <TableCell>
                              {parameter.recipeSetpointType === 'Numeric' && (
                                <span className="text-sm text-muted-foreground">
                                  {parameter.recipeSetpointLowerLimit} - {parameter.recipeSetpointUpperLimit}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={parameter.active ? 'default' : 'secondary'}>
                                {parameter.active ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={parameter.required ? 'destructive' : 'outline'}>
                                {parameter.required ? 'Required' : 'Optional'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditDialog(parameter)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => setDeleteConfirmId(parameter.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} parameters
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(currentPage - 1)}
                          disabled={!hasPreviousPage}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <div className="text-sm">
                          Page {currentPage} of {totalPages}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(currentPage + 1)}
                          disabled={!hasNextPage}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Recipe Parameter</DialogTitle>
              <DialogDescription>
                Update the recipe parameter configuration
              </DialogDescription>
            </DialogHeader>
            <ParameterForm
              formData={formData}
              setFormData={setFormData}
              operations={operations}
              units={units}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleEdit}>Update Parameter</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        {deleteConfirmId && (
          <Dialog open={true} onOpenChange={() => setDeleteConfirmId(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Parameter</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this recipe parameter? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => handleDelete(deleteConfirmId)}
                >
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </PageContainer>
    </RouteGuard>
  )
}

// Parameter Form Component
function ParameterForm({
  formData,
  setFormData,
  operations,
  units
}: {
  formData: CreateRecipeParameterInput
  setFormData: (data: CreateRecipeParameterInput) => void
  operations: Operation[]
  units: Units[]
}) {
  const updateFormData = (field: keyof CreateRecipeParameterInput, value: unknown) => {
    setFormData({ ...formData, [field]: value })
  }

  return (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Parameter Name *</Label>
          <Input
            id="name"
            value={formData.recipeParamName}
            onChange={(e) => updateFormData('recipeParamName', e.target.value)}
            placeholder="Enter parameter name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="className">Class *</Label>
          <Select value={formData.className || 'placeholder'} onValueChange={(value) => updateFormData('className', value === 'placeholder' ? '' : value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="placeholder" disabled>Select class</SelectItem>
              {CLASS_NAMES.map((className) => (
                <SelectItem key={className.value} value={className.value}>
                  {className.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Select value={formData.parameterCategory || 'Input'} onValueChange={(value) => updateFormData('parameterCategory', value as ParameterCategory)}>
          <SelectTrigger>
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {PARAMETER_CATEGORIES.map((category) => (
              <SelectItem key={category.value} value={category.value}>
                {category.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={formData.recipeParamDescription}
          onChange={(e) => updateFormData('recipeParamDescription', e.target.value)}
          placeholder="Brief description"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="details">Detailed Description</Label>
        <Textarea
          id="details"
          value={formData.description}
          onChange={(e) => updateFormData('description', e.target.value)}
          placeholder="Detailed description or notes"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="operation">Operation</Label>
          <Select value={formData.operationId || 'none'} onValueChange={(value) => updateFormData('operationId', value === 'none' ? '' : value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select operation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {operations.map((operation) => (
                <SelectItem key={operation.id} value={operation.id}>
                  {operation.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="setpointType">Setpoint Type</Label>
          <Select value={formData.recipeSetpointType || 'Numeric'} onValueChange={(value) => updateFormData('recipeSetpointType', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SETPOINT_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Setpoint Value Configuration */}
      {formData.recipeSetpointType === 'Numeric' && (
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="setpoint">Default Value</Label>
            <Input
              id="setpoint"
              type="number"
              value={formData.recipeNumericalSetpoint}
              onChange={(e) => updateFormData('recipeNumericalSetpoint', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lowerLimit">Lower Limit</Label>
            <Input
              id="lowerLimit"
              type="number"
              value={formData.recipeSetpointLowerLimit}
              onChange={(e) => updateFormData('recipeSetpointLowerLimit', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="upperLimit">Upper Limit</Label>
            <Input
              id="upperLimit"
              type="number"
              value={formData.recipeSetpointUpperLimit}
              onChange={(e) => updateFormData('recipeSetpointUpperLimit', parseFloat(e.target.value) || 100)}
            />
          </div>
        </div>
      )}

      {formData.recipeSetpointType === 'Boolean' && (
        <div className="space-y-2">
          <Label htmlFor="booleanValue">Default Value</Label>
          <div className="flex items-center space-x-2">
            <Switch
              id="booleanValue"
              checked={formData.recipeSetpointBooleanValue || false}
              onCheckedChange={(checked) => updateFormData('recipeSetpointBooleanValue', checked)}
            />
            <Label htmlFor="booleanValue">
              {formData.recipeSetpointBooleanValue ? 'True' : 'False'}
            </Label>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="units">Units</Label>
        <Select value={formData.unitsId || 'none'} onValueChange={(value) => updateFormData('unitsId', value === 'none' ? '' : value)}>
          <SelectTrigger>
            <SelectValue placeholder="Select units" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {units.map((unit) => (
              <SelectItem key={unit.id} value={unit.id}>
                {unit.name} ({unit.abbreviation})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2">
          <Switch
            id="active"
            checked={formData.active || false}
            onCheckedChange={(checked) => updateFormData('active', checked)}
          />
          <Label htmlFor="active">Active</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="required"
            checked={formData.required || false}
            onCheckedChange={(checked) => updateFormData('required', checked)}
          />
          <Label htmlFor="required">Required</Label>
        </div>
      </div>
    </div>
  )
} 