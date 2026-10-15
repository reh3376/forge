'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { toast } from 'sonner'
import { apolloClient } from '@/lib/api/unified-graphql-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Variable,
  Braces,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ArrowLeft,
  Shield,
  Settings2,
} from 'lucide-react'
import Link from 'next/link'
import {
  useAllFormulaVariables,
  useFormulaVariableMutations,
  FormulaVariable,
} from '@/lib/hooks/use-formula-variables'
import {
  useAllFormulaFunctions,
  useFormulaFunctionMutations,
  FormulaFunction,
} from '@/lib/hooks/use-formula-functions'
import {
  GET_UNITS_FOR_CONVERSION,
  ImplementationType,
  UnitReference,
} from '@/lib/api/formula-config-queries'

const VARIABLE_CATEGORIES = ['General', 'Water', 'Conversion', 'Grain', 'Custom']
const FUNCTION_CATEGORIES = ['Math', 'Conditional', 'Conversion', 'Custom']
const VARIABLE_TYPES = ['number', 'string', 'boolean']
const IMPLEMENTATION_TYPES: { value: ImplementationType; label: string; description: string }[] = [
  { value: 'EXPRESSION', label: 'Expression', description: 'Custom formula using x, y, z variables' },
  { value: 'UNIT_CONVERSION', label: 'Unit Conversion', description: 'Convert between two units' },
  { value: 'SYSTEM', label: 'System (read-only)', description: 'Built-in function' },
]

export default function FormulaConfigPage() {
  const [activeTab, setActiveTab] = useState('variables')

  // Variables state
  const { variables, loading: loadingVars, refetch: refetchVars } = useAllFormulaVariables()
  const { createVariable, updateVariable, deleteVariable, loading: mutatingVars } = useFormulaVariableMutations()
  const [editingVariable, setEditingVariable] = useState<FormulaVariable | null>(null)
  const [isVariableDialogOpen, setIsVariableDialogOpen] = useState(false)
  const [deleteVariableConfirm, setDeleteVariableConfirm] = useState<FormulaVariable | null>(null)
  const [variableForm, setVariableForm] = useState({
    name: '',
    displayName: '',
    description: '',
    type: 'number',
    defaultValue: '',
    category: 'General',
    sortOrder: 0,
  })

  // Functions state
  const { functions, loading: loadingFuncs, refetch: refetchFuncs } = useAllFormulaFunctions()
  const { createFunction, updateFunction, deleteFunction, loading: mutatingFuncs } = useFormulaFunctionMutations()
  const [editingFunction, setEditingFunction] = useState<FormulaFunction | null>(null)
  const [isFunctionDialogOpen, setIsFunctionDialogOpen] = useState(false)
  const [deleteFunctionConfirm, setDeleteFunctionConfirm] = useState<FormulaFunction | null>(null)
  const [functionForm, setFunctionForm] = useState({
    name: '',
    syntax: '',
    description: '',
    category: 'Conversion',
    exampleUsage: '',
    sortOrder: 0,
    implementationType: 'EXPRESSION' as ImplementationType,
    expression: '',
    fromUnitId: '',
    toUnitId: '',
  })

  // Units for unit conversion functions
  const { data: unitsData } = useQuery<{ unitsItems: UnitReference[] }>(GET_UNITS_FOR_CONVERSION, {
    client: apolloClient,
  })
  const units = unitsData?.unitsItems || []

  // Variable handlers
  const openCreateVariable = () => {
    setEditingVariable(null)
    setVariableForm({
      name: '',
      displayName: '',
      description: '',
      type: 'number',
      defaultValue: '',
      category: 'General',
      sortOrder: 0,
    })
    setIsVariableDialogOpen(true)
  }

  const openEditVariable = (variable: FormulaVariable) => {
    setEditingVariable(variable)
    setVariableForm({
      name: variable.name,
      displayName: variable.displayName,
      description: variable.description || '',
      type: variable.type,
      defaultValue: variable.defaultValue || '',
      category: variable.category,
      sortOrder: variable.sortOrder,
    })
    setIsVariableDialogOpen(true)
  }

  const handleSaveVariable = async () => {
    try {
      if (editingVariable) {
        await updateVariable(editingVariable.id, variableForm)
        toast.success('Variable updated successfully')
      } else {
        await createVariable(variableForm)
        toast.success('Variable created successfully')
      }
      setIsVariableDialogOpen(false)
      refetchVars()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save variable')
    }
  }

  const handleDeleteVariable = async (variable: FormulaVariable) => {
    try {
      await deleteVariable(variable.id)
      toast.success('Variable deleted successfully')
      setDeleteVariableConfirm(null)
      refetchVars()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete variable')
    }
  }

  const handleToggleVariableActive = async (variable: FormulaVariable) => {
    try {
      await updateVariable(variable.id, { isActive: !variable.isActive })
      toast.success(`Variable ${variable.isActive ? 'deactivated' : 'activated'}`)
      refetchVars()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update variable')
    }
  }

  // Function handlers
  const openCreateFunction = () => {
    setEditingFunction(null)
    setFunctionForm({
      name: '',
      syntax: '',
      description: '',
      category: 'Conversion',
      exampleUsage: '',
      sortOrder: 0,
      implementationType: 'EXPRESSION',
      expression: '',
      fromUnitId: '',
      toUnitId: '',
    })
    setIsFunctionDialogOpen(true)
  }

  const openEditFunction = (func: FormulaFunction) => {
    setEditingFunction(func)
    setFunctionForm({
      name: func.name,
      syntax: func.syntax,
      description: func.description || '',
      category: func.category,
      exampleUsage: func.exampleUsage || '',
      sortOrder: func.sortOrder,
      implementationType: func.implementationType || 'SYSTEM',
      expression: func.expression || '',
      fromUnitId: func.fromUnitId || '',
      toUnitId: func.toUnitId || '',
    })
    setIsFunctionDialogOpen(true)
  }

  const handleSaveFunction = async () => {
    try {
      const input: any = {
        name: functionForm.name,
        syntax: functionForm.syntax,
        description: functionForm.description || undefined,
        category: functionForm.category,
        exampleUsage: functionForm.exampleUsage || undefined,
        sortOrder: functionForm.sortOrder,
        implementationType: functionForm.implementationType,
      }

      // Add implementation-specific fields
      if (functionForm.implementationType === 'EXPRESSION') {
        input.expression = functionForm.expression
      } else if (functionForm.implementationType === 'UNIT_CONVERSION') {
        input.fromUnitId = functionForm.fromUnitId
        input.toUnitId = functionForm.toUnitId
      }

      if (editingFunction) {
        await updateFunction(editingFunction.id, input)
        toast.success('Function updated successfully')
      } else {
        await createFunction(input)
        toast.success('Function created successfully')
      }
      setIsFunctionDialogOpen(false)
      refetchFuncs()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save function')
    }
  }

  const handleDeleteFunction = async (func: FormulaFunction) => {
    try {
      await deleteFunction(func.id)
      toast.success('Function deleted successfully')
      setDeleteFunctionConfirm(null)
      refetchFuncs()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete function')
    }
  }

  const handleToggleFunctionActive = async (func: FormulaFunction) => {
    try {
      await updateFunction(func.id, { isActive: !func.isActive })
      toast.success(`Function ${func.isActive ? 'deactivated' : 'activated'}`)
      refetchFuncs()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update function')
    }
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/configuration/formula-library">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Library
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings2 className="h-6 w-6" />
              Formula Configuration
            </h1>
            <p className="text-muted-foreground">
              Manage variables and functions available in formula expressions
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="variables" className="flex items-center gap-2">
            <Variable className="h-4 w-4" />
            Variables ({variables.length})
          </TabsTrigger>
          <TabsTrigger value="functions" className="flex items-center gap-2">
            <Braces className="h-4 w-4" />
            Functions ({functions.length})
          </TabsTrigger>
        </TabsList>

        {/* Variables Tab */}
        <TabsContent value="variables" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="text-lg">Formula Variables</CardTitle>
                <CardDescription>
                  Variables that can be used in formula expressions
                </CardDescription>
              </div>
              <Button onClick={openCreateVariable}>
                <Plus className="h-4 w-4 mr-2" />
                Add Variable
              </Button>
            </CardHeader>
            <CardContent>
              {loadingVars ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Default</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variables.map((variable) => (
                      <TableRow key={variable.id} className={!variable.isActive ? 'opacity-50' : ''}>
                        <TableCell className="font-mono font-medium">
                          {variable.name}
                          {variable.isSystem && (
                            <Shield className="h-3 w-3 inline ml-1 text-blue-500" title="System variable" />
                          )}
                        </TableCell>
                        <TableCell>{variable.displayName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{variable.type}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {variable.defaultValue || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{variable.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={variable.isActive}
                            onCheckedChange={() => handleToggleVariableActive(variable)}
                            disabled={mutatingVars}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditVariable(variable)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteVariableConfirm(variable)}
                              disabled={variable.isSystem}
                              title={variable.isSystem ? 'System variables cannot be deleted' : 'Delete variable'}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Functions Tab */}
        <TabsContent value="functions" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="text-lg">Formula Functions</CardTitle>
                <CardDescription>
                  Functions that can be called in formula expressions
                </CardDescription>
              </div>
              <Button onClick={openCreateFunction}>
                <Plus className="h-4 w-4 mr-2" />
                Add Function
              </Button>
            </CardHeader>
            <CardContent>
              {loadingFuncs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Implementation</TableHead>
                      <TableHead>Syntax</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {functions.map((func) => (
                      <TableRow key={func.id} className={!func.isActive ? 'opacity-50' : ''}>
                        <TableCell className="font-mono font-medium">
                          {func.name}
                          {func.isSystem && (
                            <Shield className="h-3 w-3 inline ml-1 text-blue-500" title="System function" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Badge variant={
                              func.implementationType === 'SYSTEM' ? 'default' :
                              func.implementationType === 'EXPRESSION' ? 'secondary' :
                              'outline'
                            }>
                              {func.implementationType}
                            </Badge>
                            {func.implementationType === 'EXPRESSION' && func.expression && (
                              <div className="text-xs font-mono text-muted-foreground truncate max-w-[150px]" title={func.expression}>
                                {func.expression}
                              </div>
                            )}
                            {func.implementationType === 'UNIT_CONVERSION' && func.fromUnit && func.toUnit && (
                              <div className="text-xs text-muted-foreground">
                                {func.fromUnit.abbreviation} → {func.toUnit.abbreviation}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm max-w-[150px] truncate">
                          {func.syntax}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{func.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={func.isActive}
                            onCheckedChange={() => handleToggleFunctionActive(func)}
                            disabled={mutatingFuncs}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditFunction(func)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteFunctionConfirm(func)}
                              disabled={func.isSystem}
                              title={func.isSystem ? 'System functions cannot be deleted' : 'Delete function'}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Variable Dialog */}
      <Dialog open={isVariableDialogOpen} onOpenChange={setIsVariableDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingVariable ? 'Edit Variable' : 'Create Variable'}
            </DialogTitle>
            <DialogDescription>
              {editingVariable
                ? 'Update the variable configuration'
                : 'Add a new variable for use in formulas'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="var-name">Name</Label>
                <Input
                  id="var-name"
                  placeholder="grainLoad"
                  className="font-mono"
                  value={variableForm.name}
                  onChange={(e) => setVariableForm({ ...variableForm, name: e.target.value })}
                  disabled={editingVariable?.isSystem}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="var-displayName">Display Name</Label>
                <Input
                  id="var-displayName"
                  placeholder="Grain Load"
                  value={variableForm.displayName}
                  onChange={(e) => setVariableForm({ ...variableForm, displayName: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="var-description">Description</Label>
              <Textarea
                id="var-description"
                placeholder="Total grain weight in lbs"
                value={variableForm.description}
                onChange={(e) => setVariableForm({ ...variableForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="var-type">Type</Label>
                <Select
                  value={variableForm.type}
                  onValueChange={(value: string) => setVariableForm({ ...variableForm, type: value })}
                >
                  <SelectTrigger id="var-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VARIABLE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="var-category">Category</Label>
                <Select
                  value={variableForm.category}
                  onValueChange={(value: string) => setVariableForm({ ...variableForm, category: value })}
                >
                  <SelectTrigger id="var-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VARIABLE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="var-default">Default Value</Label>
                <Input
                  id="var-default"
                  placeholder="3000"
                  className="font-mono"
                  value={variableForm.defaultValue}
                  onChange={(e) => setVariableForm({ ...variableForm, defaultValue: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="var-sort">Sort Order</Label>
                <Input
                  id="var-sort"
                  type="number"
                  value={variableForm.sortOrder}
                  onChange={(e) => setVariableForm({ ...variableForm, sortOrder: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsVariableDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveVariable} disabled={mutatingVars || !variableForm.name || !variableForm.displayName}>
              {mutatingVars && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingVariable ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Function Dialog */}
      <Dialog open={isFunctionDialogOpen} onOpenChange={setIsFunctionDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingFunction ? 'Edit Function' : 'Create Function'}
            </DialogTitle>
            <DialogDescription>
              {editingFunction
                ? 'Update the function configuration'
                : 'Add a new function for use in formulas'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="func-name">Name</Label>
                <Input
                  id="func-name"
                  placeholder="MY_FUNCTION"
                  className="font-mono"
                  value={functionForm.name}
                  onChange={(e) => setFunctionForm({ ...functionForm, name: e.target.value.toUpperCase() })}
                  disabled={editingFunction?.isSystem}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="func-category">Category</Label>
                <Select
                  value={functionForm.category}
                  onValueChange={(value: string) => setFunctionForm({ ...functionForm, category: value })}
                >
                  <SelectTrigger id="func-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FUNCTION_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Implementation Type */}
            <div className="space-y-2">
              <Label>Implementation Type</Label>
              <Select
                value={functionForm.implementationType}
                onValueChange={(value: string) => setFunctionForm({ ...functionForm, implementationType: value as ImplementationType })}
                disabled={editingFunction?.isSystem}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMPLEMENTATION_TYPES.filter(t => !editingFunction?.isSystem || t.value === 'SYSTEM').map((type) => (
                    <SelectItem key={type.value} value={type.value} disabled={type.value === 'SYSTEM' && !editingFunction?.isSystem}>
                      <div>
                        <div className="font-medium">{type.label}</div>
                        <div className="text-xs text-muted-foreground">{type.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Expression field (for EXPRESSION type) */}
            {functionForm.implementationType === 'EXPRESSION' && (
              <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                <Label htmlFor="func-expression">Expression Formula</Label>
                <Input
                  id="func-expression"
                  placeholder="x * 3.78541"
                  className="font-mono"
                  value={functionForm.expression}
                  onChange={(e) => setFunctionForm({ ...functionForm, expression: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Use <code className="bg-muted px-1 rounded">x</code> for the first argument,{' '}
                  <code className="bg-muted px-1 rounded">y</code> for second,{' '}
                  <code className="bg-muted px-1 rounded">z</code> for third.
                  Example: <code className="bg-muted px-1 rounded">x * 3.78541</code> converts gallons to liters.
                </p>
              </div>
            )}

            {/* Unit conversion fields (for UNIT_CONVERSION type) */}
            {functionForm.implementationType === 'UNIT_CONVERSION' && (
              <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                <Label>Unit Conversion</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="func-fromUnit" className="text-xs">From Unit</Label>
                    <Select
                      value={functionForm.fromUnitId}
                      onValueChange={(value: string) => setFunctionForm({ ...functionForm, fromUnitId: value })}
                    >
                      <SelectTrigger id="func-fromUnit">
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {units.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name} ({unit.abbreviation})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="func-toUnit" className="text-xs">To Unit</Label>
                    <Select
                      value={functionForm.toUnitId}
                      onValueChange={(value: string) => setFunctionForm({ ...functionForm, toUnitId: value })}
                    >
                      <SelectTrigger id="func-toUnit">
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {units.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name} ({unit.abbreviation})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  The conversion rate will be looked up from the unit definitions.
                </p>
              </div>
            )}

            {/* System type info */}
            {functionForm.implementationType === 'SYSTEM' && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  System functions are built-in and their implementation cannot be changed.
                  You can only update the description and display settings.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="func-syntax">Syntax (for display)</Label>
              <Input
                id="func-syntax"
                placeholder="MY_FUNCTION(value)"
                className="font-mono"
                value={functionForm.syntax}
                onChange={(e) => setFunctionForm({ ...functionForm, syntax: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="func-description">Description</Label>
              <Textarea
                id="func-description"
                placeholder="Converts gallons to liters"
                value={functionForm.description}
                onChange={(e) => setFunctionForm({ ...functionForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="func-example">Example Usage</Label>
                <Input
                  id="func-example"
                  placeholder="MY_FUNCTION(waterLoad)"
                  className="font-mono"
                  value={functionForm.exampleUsage}
                  onChange={(e) => setFunctionForm({ ...functionForm, exampleUsage: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="func-sort">Sort Order</Label>
                <Input
                  id="func-sort"
                  type="number"
                  value={functionForm.sortOrder}
                  onChange={(e) => setFunctionForm({ ...functionForm, sortOrder: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFunctionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveFunction} disabled={mutatingFuncs || !functionForm.name || !functionForm.syntax}>
              {mutatingFuncs && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingFunction ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Variable Confirmation */}
      <AlertDialog open={!!deleteVariableConfirm} onOpenChange={() => setDeleteVariableConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Variable</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the variable &quot;{deleteVariableConfirm?.name}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteVariableConfirm && handleDeleteVariable(deleteVariableConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Function Confirmation */}
      <AlertDialog open={!!deleteFunctionConfirm} onOpenChange={() => setDeleteFunctionConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Function</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the function &quot;{deleteFunctionConfirm?.name}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteFunctionConfirm && handleDeleteFunction(deleteFunctionConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
