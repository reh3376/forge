'use client'

export const dynamic = 'force-dynamic'

import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useLazyQuery } from '@apollo/client'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FunctionSquare,
  Save,
  X,
  Loader2,
  History,
  TestTube2,
  Settings2,
  HelpCircle,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import {
  FormulaLibraryBrowser,
  FormulaEditor,
  LivePreview,
  TestCasePanel,
  FormulaHelpPanel,
  FormulaAssistantChat,
} from '@/components/formula-library'
import {
  GET_FORMULA_LIBRARIES,
  GET_FORMULA_LIBRARY,
  VALIDATE_EXPRESSION,
  CREATE_FORMULA,
  UPDATE_FORMULA,
  DELETE_FORMULA,
  EVALUATE_EXPRESSION,
  ADD_TEST_CASE,
  UPDATE_TEST_CASE,
  DELETE_TEST_CASE,
  RUN_FORMULA_TESTS,
  FormulaLibrary,
  ValidationResult,
  ExpressionResult,
  FORMULA_CATEGORIES,
} from '@/lib/api/formula-library-queries'
import { useAuth } from '@/lib/auth-context'

export default function FormulaLibraryPage() {
  const { user } = useAuth()
  const effectiveUsername = user?.name || 'System'
  const [selectedFormula, setSelectedFormula] = useState<FormulaLibrary | null>(null)
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [deleteConfirmFormula, setDeleteConfirmFormula] = useState<FormulaLibrary | null>(null)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [isAssistantOpen, setIsAssistantOpen] = useState(false)

  // Form state for create/edit
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    expression: '',
    documentation: '',
    tags: [] as string[],
  })

  // Validation state
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [isValidating, setIsValidating] = useState(false)

  // Queries
  const { data: formulasData, loading: loadingFormulas, refetch: refetchFormulas } = useQuery(
    GET_FORMULA_LIBRARIES,
    { variables: { filters: {} } }
  )

  const [fetchFormulaDetails, { data: formulaDetailsData, loading: loadingDetails }] = useLazyQuery(
    GET_FORMULA_LIBRARY,
    { fetchPolicy: 'network-only' }
  )

  const [validateExpression] = useLazyQuery(VALIDATE_EXPRESSION)

  // Mutations
  const [createFormula, { loading: creating }] = useMutation(CREATE_FORMULA)
  const [updateFormula, { loading: updating }] = useMutation(UPDATE_FORMULA)
  const [deleteFormulaMutation, { loading: deleting }] = useMutation(DELETE_FORMULA)
  const [evaluateExpression] = useMutation(EVALUATE_EXPRESSION)
  const [addTestCase] = useMutation(ADD_TEST_CASE)
  const [updateTestCase] = useMutation(UPDATE_TEST_CASE)
  const [deleteTestCase] = useMutation(DELETE_TEST_CASE)
  const [runFormulaTests] = useMutation(RUN_FORMULA_TESTS)

  const formulas: FormulaLibrary[] = formulasData?.formulaLibraries || []

  // Validation with debounce
  useEffect(() => {
    if (!formData.expression || formData.expression.trim() === '') {
      setValidation(null)
      return
    }

    const timer = setTimeout(async () => {
      setIsValidating(true)
      try {
        const { data } = await validateExpression({
          variables: { expression: formData.expression }
        })
        setValidation(data?.validateExpression)
      } catch (error) {
        console.error('Validation error:', error)
      } finally {
        setIsValidating(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [formData.expression, validateExpression])

  // Load full formula details when selected
  useEffect(() => {
    if (selectedFormula) {
      fetchFormulaDetails({ variables: { id: selectedFormula.id } })
    }
  }, [selectedFormula, fetchFormulaDetails])

  const handleSelectFormula = (formula: FormulaLibrary) => {
    setSelectedFormula(formula)
    setIsDetailPanelOpen(true)
    setIsEditing(false)
  }

  const handleCreateNew = () => {
    setSelectedFormula(null)
    setFormData({
      name: '',
      description: '',
      category: '',
      expression: '',
      documentation: '',
      tags: [],
    })
    setValidation(null)
    setIsCreating(true)
    setIsEditing(false)
    setIsDetailPanelOpen(true)
  }

  const handleEdit = (formula: FormulaLibrary) => {
    setSelectedFormula(formula)
    setFormData({
      name: formula.name,
      description: formula.description || '',
      category: formula.category || '',
      expression: formula.expression,
      documentation: formula.documentation || '',
      tags: formula.tags || [],
    })
    setIsEditing(true)
    setIsCreating(false)
    setIsDetailPanelOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name || !formData.expression) {
      toast.error('Name and expression are required')
      return
    }

    if (validation && !validation.isValid) {
      toast.error('Please fix expression errors before saving')
      return
    }

    try {
      if (isCreating) {
        const { data } = await createFormula({
          variables: {
            input: {
              name: formData.name,
              description: formData.description || undefined,
              category: formData.category || undefined,
              expression: formData.expression,
              documentation: formData.documentation || undefined,
              tags: formData.tags.length > 0 ? formData.tags : undefined,
              createdBy: effectiveUsername,
            }
          }
        })
        toast.success('Formula created successfully')
        setSelectedFormula(data.createFormula)
        setIsCreating(false)
      } else if (isEditing && selectedFormula) {
        await updateFormula({
          variables: {
            id: selectedFormula.id,
            input: {
              name: formData.name,
              description: formData.description || undefined,
              category: formData.category || undefined,
              expression: formData.expression,
              documentation: formData.documentation || undefined,
              tags: formData.tags.length > 0 ? formData.tags : undefined,
              updatedBy: effectiveUsername,
            }
          }
        })
        toast.success('Formula updated successfully')
        setIsEditing(false)
        fetchFormulaDetails({ variables: { id: selectedFormula.id } })
      }
      refetchFormulas()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save formula')
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirmFormula) return

    try {
      await deleteFormulaMutation({
        variables: {
          id: deleteConfirmFormula.id,
          deletedBy: effectiveUsername,
        }
      })
      toast.success('Formula deleted successfully')
      setDeleteConfirmFormula(null)
      if (selectedFormula?.id === deleteConfirmFormula.id) {
        setSelectedFormula(null)
        setIsDetailPanelOpen(false)
      }
      refetchFormulas()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete formula')
    }
  }

  const handleEvaluate = useCallback(async (context: Record<string, any>): Promise<ExpressionResult> => {
    const expression = isCreating || isEditing ? formData.expression : selectedFormula?.expression
    if (!expression) {
      return { success: false, error: 'No expression', executionTimeMs: 0, variablesUsed: [] }
    }

    try {
      const { data, errors } = await evaluateExpression({
        variables: {
          input: {
            expression,
            context,
          }
        }
      })

      if (errors && errors.length > 0) {
        return {
          success: false,
          error: errors[0]?.message || 'GraphQL error',
          executionTimeMs: 0,
          variablesUsed: [],
        }
      }

      if (!data?.evaluateExpression) {
        return {
          success: false,
          error: 'No response from server',
          executionTimeMs: 0,
          variablesUsed: [],
        }
      }

      return data.evaluateExpression
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Evaluation failed',
        executionTimeMs: 0,
        variablesUsed: [],
      }
    }
  }, [formData.expression, selectedFormula?.expression, isCreating, isEditing, evaluateExpression])

  const handleAddTestCase = async (testCase: {
    name: string
    inputs: Record<string, any>
    expectedOutput: number
    tolerance?: number
  }) => {
    if (!selectedFormula) {
      toast.error('No formula selected')
      return
    }

    try {
      const { data, errors } = await addTestCase({
        variables: {
          formulaId: selectedFormula.id,
          input: {
            name: testCase.name,
            inputs: testCase.inputs,
            expectedOutput: testCase.expectedOutput,
            tolerance: testCase.tolerance,
            createdBy: effectiveUsername,
          }
        }
      })

      if (errors && errors.length > 0) {
        console.error('GraphQL errors adding test case:', errors)
        toast.error(errors[0]?.message || 'Failed to add test case')
        return
      }

      if (!data?.addTestCase) {
        console.error('No data returned from addTestCase mutation')
        toast.error('Failed to add test case - no response from server')
        return
      }

      toast.success('Test case added')
      // Refetch formula details to get updated test cases
      await fetchFormulaDetails({ variables: { id: selectedFormula.id } })
    } catch (error) {
      console.error('Error adding test case:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to add test case')
    }
  }

  const handleUpdateTestCase = async (testCaseId: string, updates: {
    name?: string
    inputs?: Record<string, any>
    expectedOutput?: number
    tolerance?: number
  }) => {
    try {
      const { data, errors } = await updateTestCase({
        variables: {
          testCaseId,
          input: {
            ...updates,
            updatedBy: effectiveUsername,
          }
        }
      })

      if (errors && errors.length > 0) {
        console.error('GraphQL errors updating test case:', errors)
        toast.error(errors[0]?.message || 'Failed to update test case')
        return
      }

      if (!data?.updateTestCase) {
        toast.error('Failed to update test case - no response from server')
        return
      }

      const passed = data.updateTestCase.lastRunPassed
      toast.success(passed ? 'Test case updated and passed!' : 'Test case updated (test failed)')

      if (selectedFormula) {
        await fetchFormulaDetails({ variables: { id: selectedFormula.id } })
      }
    } catch (error) {
      console.error('Error updating test case:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update test case')
    }
  }

  const handleDeleteTestCase = async (testCaseId: string) => {
    try {
      await deleteTestCase({
        variables: { testCaseId }
      })

      toast.success('Test case deleted')

      if (selectedFormula) {
        await fetchFormulaDetails({ variables: { id: selectedFormula.id } })
      }
    } catch (error) {
      console.error('Error deleting test case:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete test case')
    }
  }

  const handleRunTests = async () => {
    if (!selectedFormula) return { passed: 0, failed: 0, total: 0 }

    try {
      const { data } = await runFormulaTests({
        variables: { formulaId: selectedFormula.id }
      })
      fetchFormulaDetails({ variables: { id: selectedFormula.id } })
      return data.runFormulaTests
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to run tests')
      return { passed: 0, failed: 0, total: 0 }
    }
  }

  const handleClosePanel = () => {
    setIsDetailPanelOpen(false)
    setIsCreating(false)
    setIsEditing(false)
    setSelectedFormula(null)
  }

  const detailFormula = formulaDetailsData?.formulaLibrary || selectedFormula

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 mb-2">
            <FunctionSquare className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Formula Library</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsHelpOpen(true)}>
              <HelpCircle className="h-4 w-4 mr-2" />
              Help
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsAssistantOpen(true)}>
              <Sparkles className="h-4 w-4 mr-2" />
              AI Assistant
            </Button>
            <Link href="/configuration/formula-config">
              <Button variant="outline" size="sm">
                <Settings2 className="h-4 w-4 mr-2" />
                Configure Variables
              </Button>
            </Link>
          </div>
        </div>
        <p className="text-muted-foreground">
          Create and manage calculation formulas for BOM items. Formulas use Excel-like syntax
          and support variables like grainLoad, waterLoad, and mash bill percentages.
        </p>
      </div>

      {/* Main Content */}
      <FormulaLibraryBrowser
        formulas={formulas}
        isLoading={loadingFormulas}
        selectedId={selectedFormula?.id}
        onSelect={handleSelectFormula}
        onCreateNew={handleCreateNew}
        onEdit={handleEdit}
        onDelete={(formula) => setDeleteConfirmFormula(formula)}
      />

      {/* Detail Panel */}
      <Sheet open={isDetailPanelOpen} onOpenChange={setIsDetailPanelOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FunctionSquare className="h-5 w-5" />
              {isCreating ? 'New Formula' : isEditing ? 'Edit Formula' : detailFormula?.name}
            </SheetTitle>
            <SheetDescription>
              {isCreating
                ? 'Create a new calculation formula'
                : isEditing
                  ? 'Modify formula settings and expression'
                  : detailFormula?.description || 'View and test formula'
              }
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {(isCreating || isEditing) ? (
              /* Edit/Create Form */
              <>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Corn Grain Calculation"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="What does this formula calculate?"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {FORMULA_CATEGORIES.map(cat => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Formula Expression *</Label>
                  <FormulaEditor
                    value={formData.expression}
                    onChange={(value) => setFormData({ ...formData, expression: value })}
                    validation={validation}
                    isValidating={isValidating}
                  />
                </div>

                <LivePreview
                  expression={formData.expression}
                  onEvaluate={handleEvaluate}
                />

                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={handleClosePanel}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={creating || updating || !formData.name || !formData.expression}
                  >
                    {(creating || updating) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    {isCreating ? 'Create Formula' : 'Save Changes'}
                  </Button>
                </div>
              </>
            ) : detailFormula ? (
              /* View Mode */
              <Tabs defaultValue="details">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="test">
                    <TestTube2 className="h-4 w-4 mr-1" />
                    Test
                  </TabsTrigger>
                  <TabsTrigger value="history">
                    <History className="h-4 w-4 mr-1" />
                    History
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">Formula</CardTitle>
                        <div className="flex items-center gap-2">
                          {detailFormula.category && (
                            <Badge variant="outline">{detailFormula.category}</Badge>
                          )}
                          <Badge>v{detailFormula.version}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-muted rounded-lg p-4 font-mono text-sm">
                        <code className="text-primary">{detailFormula.expression}</code>
                      </div>
                    </CardContent>
                  </Card>

                  {detailFormula.requiredVariables?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Required Variables</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {detailFormula.requiredVariables.map((v: string) => (
                            <Badge key={v} variant="secondary">{v}</Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <LivePreview
                    expression={detailFormula.expression}
                    onEvaluate={handleEvaluate}
                  />

                  <div className="flex justify-end">
                    <Button onClick={() => handleEdit(detailFormula)}>
                      Edit Formula
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="test" className="mt-4">
                  <TestCasePanel
                    testCases={detailFormula.testCases || []}
                    onAddTestCase={handleAddTestCase}
                    onUpdateTestCase={handleUpdateTestCase}
                    onDeleteTestCase={handleDeleteTestCase}
                    onRunTests={handleRunTests}
                    isLoading={loadingDetails}
                  />
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Version History</CardTitle>
                      <CardDescription>
                        Changes made to this formula over time
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {detailFormula.versions?.length > 0 ? (
                        <div className="space-y-4">
                          {detailFormula.versions.map((version: any) => (
                            <div
                              key={version.id}
                              className="border rounded-lg p-3"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <Badge>v{version.version}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(version.createdAt).toLocaleString()}
                                </span>
                              </div>
                              <div className="bg-muted rounded p-2 font-mono text-xs mb-2">
                                {version.expression}
                              </div>
                              {version.changeReason && (
                                <p className="text-sm text-muted-foreground">
                                  {version.changeReason}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                by {version.createdBy}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No version history available
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      {/* Help Panel */}
      <Sheet open={isHelpOpen} onOpenChange={setIsHelpOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              Formula Reference
            </SheetTitle>
            <SheetDescription>
              Quick reference for expression syntax, functions, variables, and common patterns
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 h-[calc(100vh-8rem)]">
            <FormulaHelpPanel />
          </div>
        </SheetContent>
      </Sheet>

      {/* AI Assistant Panel */}
      <Sheet open={isAssistantOpen} onOpenChange={setIsAssistantOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Formula Assistant
            </SheetTitle>
            <SheetDescription>
              AI-powered help for crafting BOM calculation formulas
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 h-[calc(100vh-8rem)]">
            <FormulaAssistantChat
              onUseFormula={(expression) => {
                if (isCreating || isEditing) {
                  setFormData({ ...formData, expression })
                } else {
                  setFormData({
                    name: '',
                    description: '',
                    category: '',
                    expression,
                    documentation: '',
                    tags: [],
                  })
                  setIsCreating(true)
                  setIsDetailPanelOpen(true)
                }
                setIsAssistantOpen(false)
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmFormula} onOpenChange={() => setDeleteConfirmFormula(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Formula</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirmFormula?.name}"?
              This action cannot be undone. Any BOM items using this formula will
              need to be reconfigured.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
