'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@apollo/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Calculator,
  FunctionSquare,
  Plus,
  Trash2,
  Edit,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { GET_FORMULA_LIBRARIES, FormulaLibrary, FORMULA_CATEGORIES } from '@/lib/api/formula-library-queries'
import { cn } from '@/lib/utils'

// BOM calculation modes
export const BOM_CALCULATION_MODES = [
  { value: 'STATIC', label: 'Static Value', description: 'Fixed quantity entered manually' },
  { value: 'FORMULA_GRAIN', label: 'Grain Formula', description: 'Calculate based on grain load' },
  { value: 'FORMULA_WATER', label: 'Water Formula', description: 'Calculate based on water load' },
  { value: 'ENZYME_NORMALIZED', label: 'Enzyme Dosing', description: 'Calculate per grain starch content' },
  { value: 'EXPRESSION', label: 'Custom Expression', description: 'Use formula library expression' },
] as const

export type BomCalculationMode = typeof BOM_CALCULATION_MODES[number]['value']

// Ingredient category types that can have formula configurations
export const CONFIGURABLE_CATEGORIES = [
  { value: 'grains', label: 'Grains', icon: '🌾' },
  { value: 'water', label: 'Water & Backset', icon: '💧' },
  { value: 'enzymes', label: 'Enzymes', icon: '🧪' },
  { value: 'additives', label: 'Additives', icon: '🧂' },
  { value: 'yeast', label: 'Yeast', icon: '🦠' },
] as const

export type ConfigurableCategory = typeof CONFIGURABLE_CATEGORIES[number]['value']

// Configuration for a single category
export interface CategoryFormulaConfig {
  category: ConfigurableCategory
  calculationMode: BomCalculationMode
  formulaLibraryId?: string
  formulaName?: string
}

interface BomFormulaConfigProps {
  configurations: CategoryFormulaConfig[]
  onChange: (configs: CategoryFormulaConfig[]) => void
  isEditing?: boolean
  className?: string
}

export function BomFormulaConfig({
  configurations,
  onChange,
  isEditing = true,
  className,
}: BomFormulaConfigProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<CategoryFormulaConfig | null>(null)
  const [formData, setFormData] = useState<Partial<CategoryFormulaConfig>>({})

  // Fetch available formulas
  const { data: formulasData, loading: loadingFormulas } = useQuery(GET_FORMULA_LIBRARIES, {
    variables: { filters: {} }
  })

  const formulas: FormulaLibrary[] = formulasData?.formulaLibraries || []

  // Get formulas filtered by category
  const getFormulasForCategory = (category: string) => {
    return formulas.filter(f => {
      if (!f.category) return true // Include formulas without category
      // Map formula categories to ingredient categories
      const categoryMap: Record<string, string[]> = {
        'Grain': ['grains'],
        'Water': ['water'],
        'Enzyme': ['enzymes'],
        'Custom': ['additives', 'yeast'],
      }
      return categoryMap[f.category]?.includes(category) ?? true
    })
  }

  const handleOpenDialog = (config?: CategoryFormulaConfig) => {
    if (config) {
      setEditingConfig(config)
      setFormData({ ...config })
    } else {
      setEditingConfig(null)
      setFormData({
        category: 'grains',
        calculationMode: 'STATIC',
      })
    }
    setIsDialogOpen(true)
  }

  const handleSave = () => {
    if (!formData.category || !formData.calculationMode) return

    const newConfig: CategoryFormulaConfig = {
      category: formData.category as ConfigurableCategory,
      calculationMode: formData.calculationMode as BomCalculationMode,
      formulaLibraryId: formData.formulaLibraryId,
      formulaName: formData.formulaName,
    }

    if (editingConfig) {
      // Update existing
      onChange(configurations.map(c =>
        c.category === editingConfig.category ? newConfig : c
      ))
    } else {
      // Add new (replace if category exists)
      const existing = configurations.find(c => c.category === newConfig.category)
      if (existing) {
        onChange(configurations.map(c =>
          c.category === newConfig.category ? newConfig : c
        ))
      } else {
        onChange([...configurations, newConfig])
      }
    }

    setIsDialogOpen(false)
    setEditingConfig(null)
    setFormData({})
  }

  const handleDelete = (category: ConfigurableCategory) => {
    onChange(configurations.filter(c => c.category !== category))
  }

  const handleFormulaSelect = (formulaId: string) => {
    const formula = formulas.find(f => f.id === formulaId)
    setFormData({
      ...formData,
      formulaLibraryId: formulaId,
      formulaName: formula?.name,
    })
  }

  // Get category display info
  const getCategoryInfo = (category: string) => {
    return CONFIGURABLE_CATEGORIES.find(c => c.value === category) || {
      value: category,
      label: category,
      icon: '📦'
    }
  }

  // Get mode display info
  const getModeInfo = (mode: string) => {
    return BOM_CALCULATION_MODES.find(m => m.value === mode) || {
      value: mode,
      label: mode,
      description: ''
    }
  }

  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              BOM Calculation Settings
            </CardTitle>
            <CardDescription className="text-xs">
              Configure how quantities are calculated for each ingredient category
            </CardDescription>
          </div>
          {isEditing && (
            <Button size="sm" onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-1" />
              Configure
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {configurations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calculator className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No formula configurations</p>
            <p className="text-xs">All BOM items will use static quantities</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Calculation Mode</TableHead>
                  <TableHead>Formula</TableHead>
                  {isEditing && <TableHead className="w-[80px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {configurations.map(config => {
                  const categoryInfo = getCategoryInfo(config.category)
                  const modeInfo = getModeInfo(config.calculationMode)

                  return (
                    <TableRow key={config.category}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{categoryInfo.icon}</span>
                          <span className="font-medium">{categoryInfo.label}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {modeInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {config.formulaName ? (
                          <div className="flex items-center gap-2">
                            <FunctionSquare className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{config.formulaName}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      {isEditing && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handleOpenDialog(config)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive"
                              onClick={() => handleDelete(config.category)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Configuration Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingConfig ? 'Edit Calculation Config' : 'Add Calculation Config'}
            </DialogTitle>
            <DialogDescription>
              Configure how BOM quantities are calculated for this category
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Category Selection */}
            <div className="grid gap-2">
              <Label>Ingredient Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value as ConfigurableCategory })}
                disabled={!!editingConfig}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CONFIGURABLE_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>
                      <span className="flex items-center gap-2">
                        <span>{cat.icon}</span>
                        <span>{cat.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Calculation Mode */}
            <div className="grid gap-2">
              <Label>Calculation Mode</Label>
              <Select
                value={formData.calculationMode}
                onValueChange={(value) => setFormData({
                  ...formData,
                  calculationMode: value as BomCalculationMode,
                  formulaLibraryId: value === 'EXPRESSION' ? formData.formulaLibraryId : undefined,
                  formulaName: value === 'EXPRESSION' ? formData.formulaName : undefined,
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  {BOM_CALCULATION_MODES.map(mode => (
                    <SelectItem key={mode.value} value={mode.value}>
                      <div className="flex flex-col">
                        <span>{mode.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {mode.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Formula Selection (only for EXPRESSION mode) */}
            {formData.calculationMode === 'EXPRESSION' && (
              <div className="grid gap-2">
                <Label>Formula Library Expression</Label>
                <Select
                  value={formData.formulaLibraryId}
                  onValueChange={handleFormulaSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a formula" />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingFormulas ? (
                      <SelectItem value="loading" disabled>
                        Loading formulas...
                      </SelectItem>
                    ) : (
                      getFormulasForCategory(formData.category || '').map(formula => (
                        <SelectItem key={formula.id} value={formula.id}>
                          <div className="flex flex-col">
                            <span>{formula.name}</span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {formula.expression.substring(0, 40)}
                              {formula.expression.length > 40 ? '...' : ''}
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>

                {formData.formulaLibraryId && (
                  <div className="bg-muted rounded p-2 text-xs">
                    <div className="flex items-center gap-1 mb-1">
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                      <span className="font-medium">Selected Formula</span>
                    </div>
                    <code className="text-primary">
                      {formulas.find(f => f.id === formData.formulaLibraryId)?.expression}
                    </code>
                  </div>
                )}
              </div>
            )}

            {/* Info about built-in modes */}
            {formData.calculationMode && formData.calculationMode !== 'STATIC' && formData.calculationMode !== 'EXPRESSION' && (
              <div className="bg-blue-50 dark:bg-blue-950/20 rounded p-3 text-xs">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-700 dark:text-blue-400">
                      Built-in Calculation
                    </p>
                    <p className="text-blue-600 dark:text-blue-300 mt-1">
                      {formData.calculationMode === 'FORMULA_GRAIN' &&
                        'Quantities calculated as a ratio of total grain load using the item\'s formula multiplier.'}
                      {formData.calculationMode === 'FORMULA_WATER' &&
                        'Quantities calculated as a ratio of total water load using the item\'s formula multiplier.'}
                      {formData.calculationMode === 'ENZYME_NORMALIZED' &&
                        'Enzyme quantities calculated based on grain starch content and dosing rates.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formData.category || !formData.calculationMode ||
                (formData.calculationMode === 'EXPRESSION' && !formData.formulaLibraryId)}
            >
              {editingConfig ? 'Update' : 'Add'} Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export default BomFormulaConfig
