'use client'

import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Plus,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  TestTube2,
  Trash2,
  ChevronRight,
  Pencil,
  Save,
  X
} from 'lucide-react'
import { FormulaTestCase, TestResults } from '@/lib/api/formula-library-queries'
import { useGrainCharacters, getGrainCharacterCode } from '@/lib/hooks/use-grain-characters'
import { useFormulaVariables } from '@/lib/hooks/use-formula-variables'
import { cn } from '@/lib/utils'

interface TestCasePanelProps {
  testCases: FormulaTestCase[]
  onAddTestCase: (testCase: {
    name: string
    inputs: Record<string, any>
    expectedOutput: number
    tolerance?: number
  }) => Promise<void>
  onUpdateTestCase?: (testCaseId: string, updates: {
    name?: string
    inputs?: Record<string, any>
    expectedOutput?: number
    tolerance?: number
  }) => Promise<void>
  onRunTests: () => Promise<TestResults>
  onDeleteTestCase?: (id: string) => Promise<void>
  isLoading?: boolean
  className?: string
}

interface VariableInput {
  key: string
  value: string
}

export function TestCasePanel({
  testCases,
  onAddTestCase,
  onUpdateTestCase,
  onRunTests,
  onDeleteTestCase,
  isLoading,
  className,
}: TestCasePanelProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [testResults, setTestResults] = useState<TestResults | null>(null)
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null)
  const [editingTestId, setEditingTestId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<{
    name: string
    variables: VariableInput[]
    expectedOutput: string
    tolerance: string
  } | null>(null)
  const [newTestCase, setNewTestCase] = useState({
    name: '',
    variables: [
      { key: 'grainLoad', value: '3000' },
      { key: 'waterLoad', value: '240' },
    ] as VariableInput[],
    expectedOutput: '',
    tolerance: '0.01',
  })

  // Fetch formula variables from database
  const { variables: dbVariables } = useFormulaVariables()

  // Fetch available grain characters for dynamic variable options
  const { grainCharacters, loading: loadingGrainChars } = useGrainCharacters()

  // Build the list of all available quick-add variables
  const allVariables = useMemo(() => {
    // Use DB variables instead of hardcoded static ones
    const dbVars = dbVariables.map(v => ({
      key: v.name,
      label: v.displayName,
      description: v.description || v.displayName,
      defaultValue: v.defaultValue || '0',
      isGrain: false,
      category: v.category,
    }))

    const grainVars = grainCharacters.map(grain => {
      const code = getGrainCharacterCode(grain)
      return {
        key: code,
        label: code,
        description: `${grain.name} percentage (0-100)`,
        defaultValue: '0',
        isGrain: true,
        category: 'Grain',
      }
    })

    return [...dbVars, ...grainVars]
  }, [dbVariables, grainCharacters])

  // Helper to convert variables array to inputs object
  const variablesToInputs = (variables: VariableInput[]): Record<string, any> => {
    const inputs: Record<string, any> = {}
    for (const v of variables) {
      if (v.key.trim()) {
        const numVal = parseFloat(v.value)
        inputs[v.key.trim()] = isNaN(numVal) ? v.value : numVal
      }
    }
    return inputs
  }

  // Helper to convert inputs object to variables array
  const inputsToVariables = (inputs: Record<string, any>): VariableInput[] => {
    return Object.entries(inputs).map(([key, value]) => ({
      key,
      value: String(value),
    }))
  }

  const handleAddVariable = () => {
    setNewTestCase({
      ...newTestCase,
      variables: [...newTestCase.variables, { key: '', value: '' }],
    })
  }

  const handleRemoveVariable = (index: number) => {
    setNewTestCase({
      ...newTestCase,
      variables: newTestCase.variables.filter((_, i) => i !== index),
    })
  }

  const handleVariableChange = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...newTestCase.variables]
    const current = updated[index]
    if (!current) return
    updated[index] = { key: field === 'key' ? value : current.key, value: field === 'value' ? value : current.value }
    setNewTestCase({ ...newTestCase, variables: updated })
  }

  const handleAddQuickVariable = (variable: { key: string; defaultValue: string }) => {
    // Check if already exists
    if (newTestCase.variables.some(v => v.key === variable.key)) return
    setNewTestCase({
      ...newTestCase,
      variables: [...newTestCase.variables, { key: variable.key, value: variable.defaultValue }],
    })
  }

  const handleAddTestCase = async () => {
    const inputs = variablesToInputs(newTestCase.variables)

    await onAddTestCase({
      name: newTestCase.name,
      inputs,
      expectedOutput: parseFloat(newTestCase.expectedOutput),
      tolerance: parseFloat(newTestCase.tolerance),
    })

    setNewTestCase({
      name: '',
      variables: [
        { key: 'grainLoad', value: '3000' },
        { key: 'waterLoad', value: '240' },
      ],
      expectedOutput: '',
      tolerance: '0.01',
    })
    setIsDialogOpen(false)
  }

  const handleRunTests = async () => {
    setIsRunning(true)
    try {
      const results = await onRunTests()
      setTestResults(results)
    } finally {
      setIsRunning(false)
    }
  }

  const handleStartEdit = (test: FormulaTestCase) => {
    const inputs = test.inputs as Record<string, any>
    setEditingTestId(test.id)
    setEditValues({
      name: test.name,
      variables: inputsToVariables(inputs),
      expectedOutput: String(test.expectedOutput),
      tolerance: String(test.tolerance ?? 0.01),
    })
  }

  const handleCancelEdit = () => {
    setEditingTestId(null)
    setEditValues(null)
  }

  const handleEditAddVariable = () => {
    if (!editValues) return
    setEditValues({
      ...editValues,
      variables: [...editValues.variables, { key: '', value: '' }],
    })
  }

  const handleEditRemoveVariable = (index: number) => {
    if (!editValues) return
    setEditValues({
      ...editValues,
      variables: editValues.variables.filter((_, i) => i !== index),
    })
  }

  const handleEditVariableChange = (index: number, field: 'key' | 'value', value: string) => {
    if (!editValues) return
    const updated = [...editValues.variables]
    const current = updated[index]
    if (!current) return
    updated[index] = { key: field === 'key' ? value : current.key, value: field === 'value' ? value : current.value }
    setEditValues({ ...editValues, variables: updated })
  }

  const handleSaveEdit = async (testCaseId: string) => {
    if (!editValues || !onUpdateTestCase) return

    setIsSaving(true)
    try {
      const inputs = variablesToInputs(editValues.variables)

      await onUpdateTestCase(testCaseId, {
        name: editValues.name,
        inputs,
        expectedOutput: parseFloat(editValues.expectedOutput),
        tolerance: parseFloat(editValues.tolerance),
      })

      setEditingTestId(null)
      setEditValues(null)
    } finally {
      setIsSaving(false)
    }
  }

  const passedCount = testCases.filter(t => t.lastRunPassed === true).length
  const failedCount = testCases.filter(t => t.lastRunPassed === false).length
  const notRunCount = testCases.filter(t => t.lastRunPassed === undefined || t.lastRunPassed === null).length

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <TestTube2 className="h-4 w-4" />
              Test Cases
            </CardTitle>
            <CardDescription className="text-xs">
              Verify formula with expected inputs/outputs
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {testCases.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunTests}
                disabled={isRunning || isLoading}
                className="h-7 text-xs"
              >
                {isRunning ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Play className="h-3 w-3 mr-1" />
                )}
                Run All
              </Button>
            )}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" />
                  Add Test
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Test Case</DialogTitle>
                  <DialogDescription>
                    Define input values and expected output for this test
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="test-name">Test Name</Label>
                    <Input
                      id="test-name"
                      placeholder="e.g., Standard bourbon grain calculation"
                      value={newTestCase.name}
                      onChange={(e) => setNewTestCase({ ...newTestCase, name: e.target.value })}
                    />
                  </div>

                  {/* Variables Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Variables</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleAddVariable}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Variable
                      </Button>
                    </div>

                    {/* Quick add variables */}
                    <div className="flex flex-wrap gap-1">
                      <TooltipProvider>
                        {/* Static variables */}
                        {allVariables.filter(v => !v.isGrain).map((v) => (
                          <Tooltip key={v.key}>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs"
                                disabled={newTestCase.variables.some(nv => nv.key === v.key)}
                                onClick={() => handleAddQuickVariable(v)}
                              >
                                + {v.label}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">{v.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                        {/* Grain character variables */}
                        {loadingGrainChars ? (
                          <span className="text-xs text-muted-foreground px-2">Loading grains...</span>
                        ) : (
                          allVariables.filter(v => v.isGrain).map((v) => (
                            <Tooltip key={v.key}>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-6 text-xs border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
                                  disabled={newTestCase.variables.some(nv => nv.key === v.key)}
                                  onClick={() => handleAddQuickVariable(v)}
                                >
                                  + {v.label}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">{v.description}</p>
                              </TooltipContent>
                            </Tooltip>
                          ))
                        )}
                      </TooltipProvider>
                    </div>

                    {/* Variable inputs */}
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {newTestCase.variables.map((variable, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            placeholder="Variable name"
                            className="h-8 flex-1"
                            value={variable.key}
                            onChange={(e) => handleVariableChange(index, 'key', e.target.value)}
                          />
                          <Input
                            placeholder="Value"
                            className="h-8 w-24"
                            value={variable.value}
                            onChange={(e) => handleVariableChange(index, 'value', e.target.value)}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleRemoveVariable(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="test-expected">Expected Output</Label>
                      <Input
                        id="test-expected"
                        type="number"
                        step="0.01"
                        placeholder="e.g., 2100"
                        value={newTestCase.expectedOutput}
                        onChange={(e) => setNewTestCase({ ...newTestCase, expectedOutput: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="test-tolerance">Tolerance</Label>
                      <Input
                        id="test-tolerance"
                        type="number"
                        step="0.001"
                        value={newTestCase.tolerance}
                        onChange={(e) => setNewTestCase({ ...newTestCase, tolerance: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddTestCase}
                    disabled={!newTestCase.name || !newTestCase.expectedOutput}
                  >
                    Add Test Case
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        {testCases.length > 0 && (
          <div className="flex items-center gap-4 mb-4">
            <Badge variant="outline" className="gap-1">
              <span className="font-normal">Total:</span> {testCases.length}
            </Badge>
            {passedCount > 0 && (
              <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50 dark:bg-green-950/20">
                <CheckCircle2 className="h-3 w-3" />
                {passedCount} passed
              </Badge>
            )}
            {failedCount > 0 && (
              <Badge variant="outline" className="gap-1 text-red-600 border-red-200 bg-red-50 dark:bg-red-950/20">
                <XCircle className="h-3 w-3" />
                {failedCount} failed
              </Badge>
            )}
            {notRunCount > 0 && (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                {notRunCount} not run
              </Badge>
            )}
          </div>
        )}

        {/* Test Cases Table */}
        {testCases.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <TestTube2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No test cases yet</p>
            <p className="text-xs">Add test cases to verify your formula works correctly</p>
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30px]"></TableHead>
                  <TableHead className="w-[30px]">Status</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="w-[100px]">Last Run</TableHead>
                  {onDeleteTestCase && (
                    <TableHead className="w-[50px]"></TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {testCases.map((test) => {
                  const isExpanded = expandedTestId === test.id
                  return (
                    <React.Fragment key={test.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedTestId(isExpanded ? null : test.id)}
                      >
                        <TableCell className="w-[30px] p-2">
                          <ChevronRight className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform",
                            isExpanded && "rotate-90"
                          )} />
                        </TableCell>
                        <TableCell>
                          {test.lastRunPassed === true && (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          )}
                          {test.lastRunPassed === false && (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          {(test.lastRunPassed === undefined || test.lastRunPassed === null) && (
                            <Clock className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{test.name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {test.expectedOutput.toLocaleString()}
                        </TableCell>
                        <TableCell className={cn(
                          'text-right font-mono text-sm',
                          test.lastRunPassed === false && 'text-red-600'
                        )}>
                          {test.lastRunOutput !== undefined && test.lastRunOutput !== null
                            ? test.lastRunOutput.toLocaleString()
                            : '-'
                          }
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {test.lastRunAt
                            ? new Date(test.lastRunAt).toLocaleDateString()
                            : 'Never'
                          }
                        </TableCell>
                        {onDeleteTestCase && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                onDeleteTestCase(test.id)
                              }}
                            >
                              <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${test.id}-inputs`} className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={onDeleteTestCase ? 7 : 6} className="p-0">
                            <div className="px-4 py-3 border-t">
                              {editingTestId === test.id && editValues ? (
                                /* Edit Mode */
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between">
                                    <div className="text-xs font-medium text-muted-foreground">Edit Test Case</div>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={handleCancelEdit}
                                        disabled={isSaving}
                                      >
                                        <X className="h-3 w-3 mr-1" />
                                        Cancel
                                      </Button>
                                      <Button
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => handleSaveEdit(test.id)}
                                        disabled={isSaving}
                                      >
                                        {isSaving ? (
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        ) : (
                                          <Save className="h-3 w-3 mr-1" />
                                        )}
                                        Save
                                      </Button>
                                    </div>
                                  </div>

                                  <div className="grid gap-3">
                                    <div className="grid gap-1">
                                      <Label className="text-xs">Test Name</Label>
                                      <Input
                                        className="h-8"
                                        value={editValues.name}
                                        onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                                      />
                                    </div>

                                    {/* Variables Section */}
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <Label className="text-xs">Variables</Label>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 text-xs"
                                          onClick={handleEditAddVariable}
                                        >
                                          <Plus className="h-3 w-3 mr-1" />
                                          Add
                                        </Button>
                                      </div>
                                      {/* Quick add variables for edit mode */}
                                      <div className="flex flex-wrap gap-1">
                                        <TooltipProvider>
                                          {allVariables.map((v) => (
                                            <Tooltip key={v.key}>
                                              <TooltipTrigger asChild>
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  className={cn(
                                                    "h-5 text-[10px]",
                                                    v.isGrain && "border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
                                                  )}
                                                  disabled={editValues.variables.some(ev => ev.key === v.key)}
                                                  onClick={() => {
                                                    setEditValues({
                                                      ...editValues,
                                                      variables: [...editValues.variables, { key: v.key, value: v.defaultValue }],
                                                    })
                                                  }}
                                                >
                                                  + {v.label}
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p className="text-xs">{v.description}</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          ))}
                                        </TooltipProvider>
                                      </div>
                                      <div className="space-y-2 max-h-40 overflow-y-auto">
                                        {editValues.variables.map((variable, index) => (
                                          <div key={index} className="flex items-center gap-2">
                                            <Input
                                              placeholder="Variable"
                                              className="h-7 text-xs flex-1"
                                              value={variable.key}
                                              onChange={(e) => handleEditVariableChange(index, 'key', e.target.value)}
                                            />
                                            <Input
                                              placeholder="Value"
                                              className="h-7 text-xs w-20"
                                              value={variable.value}
                                              onChange={(e) => handleEditVariableChange(index, 'value', e.target.value)}
                                            />
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="h-7 w-7 p-0"
                                              onClick={() => handleEditRemoveVariable(index)}
                                            >
                                              <X className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                      <div className="grid gap-1">
                                        <Label className="text-xs">Expected Output</Label>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          className="h-8"
                                          value={editValues.expectedOutput}
                                          onChange={(e) => setEditValues({ ...editValues, expectedOutput: e.target.value })}
                                        />
                                      </div>
                                      <div className="grid gap-1">
                                        <Label className="text-xs">Tolerance</Label>
                                        <Input
                                          type="number"
                                          step="0.001"
                                          className="h-8"
                                          value={editValues.tolerance}
                                          onChange={(e) => setEditValues({ ...editValues, tolerance: e.target.value })}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                /* View Mode */
                                <>
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs font-medium text-muted-foreground">Test Inputs</div>
                                    {onUpdateTestCase && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleStartEdit(test)
                                        }}
                                      >
                                        <Pencil className="h-3 w-3 mr-1" />
                                        Edit
                                      </Button>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {Object.entries(test.inputs as Record<string, any>).map(([key, value]) => (
                                      <div key={key} className="bg-background rounded-md px-3 py-2 border">
                                        <div className="text-xs text-muted-foreground">{key}</div>
                                        <div className="font-mono text-sm font-medium">
                                          {typeof value === 'number' ? value.toLocaleString() : String(value)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                                    <span>Expected: <span className="font-mono font-medium">{test.expectedOutput.toLocaleString()}</span></span>
                                    {test.tolerance && (
                                      <span>Tolerance: <span className="font-mono">±{test.tolerance}</span></span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Test Results Summary */}
        {testResults && (
          <div className={cn(
            'mt-4 p-3 rounded-lg border',
            testResults.failed === 0 && 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800',
            testResults.failed > 0 && 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
          )}>
            <div className="flex items-center gap-2">
              {testResults.failed === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <span className="font-medium">
                {testResults.passed}/{testResults.total} tests passed
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default TestCasePanel
