'use client'

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery } from '@apollo/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Trash2, Plus, ChevronUp, ChevronDown, AlertCircle, Calculator, Loader2 } from 'lucide-react'
import { FormModal } from '@/components/ui/modal'
import { UnitsSelect } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { categorizeIngredientByItemGroup, getIngredientCategoryLabel, type IngredientCategory } from '@/lib/recipe-utils'
import { getTemperatureDisplay } from '@/lib/utils/temperature-utils'
import { ITEM_QUERIES } from '@/lib/api/graphql-queries'
import { GET_FORMULA_LIBRARIES, FormulaLibrary, VALIDATE_EXPRESSION } from '@/lib/api/formula-library-queries'
import { validateWaterBacksetPercentages } from '@/lib/utils/recipe-auto-populate'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useEnzymeDosing } from '@/hooks/useEnzymeDosing'
import { useLazyQuery } from '@apollo/client'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

// Formula calculation mode types
export type BomCalculationMode = 'STATIC' | 'FORMULA_GRAIN' | 'FORMULA_WATER' | 'ENZYME_NORMALIZED' | 'EXPRESSION'
export type BomFormulaType = 'SIMPLE_RATIO' | 'WATER_PER_BUSHEL' | 'BACKSET_PERCENTAGE' | 'CUSTOM'

// Types for Recipe Management
export interface RecipeIngredient {
	id: string
	itemCode: string
	name: string
	quantity: number
	unit: string
	category: IngredientCategory
	itemGroup?: string | undefined // Allow undefined to match the type from GraphQL
	operation?: string
	createdAt: Date
	notes?: string
	// Formula configuration fields
	calculationMode?: BomCalculationMode
	formulaType?: BomFormulaType
	formulaMultiplier?: number
	customExpression?: string
	formulaLibraryId?: string
	expressionVariables?: Record<string, unknown>
	expressionValidated?: boolean
}

export interface RecipeIngredientWithMeta extends RecipeIngredient {
	isNew?: boolean
	isModified?: boolean
}

export interface RecipeIngredientFormData {
	itemCode: string
	name: string
	quantity: number
	unit: string
	category: IngredientCategory
	itemGroup?: string | undefined
	operation?: string
}

export interface RecipeParameter {
	id: string
	name: string
	description: string
	type: 'numeric' | 'boolean' | 'text'
	value: string | number | boolean
	unit?: string
	operation?: string
	category?: 'Input' | 'Output' | 'Calculated'
	createdAt: Date
}

export interface MashingStep {
	id: string
	index: number
	stepType: string
	holdType?: 'Heat' | 'Cool' | 'None'
	included: boolean
	notes?: string
	heatTempSp?: number
	coolTempSp?: number
	timeDuration?: number
	waterBacksetSP?: number
	additiveType?: string
	selectedItemId?: string
	itemQuantity?: number
	waterQuantity?: number
	backsetQuantity?: number
	recipeBomItems?: RecipeBomItem[]
}

export interface RecipeBomItem {
	id: string
	item: {
		id: string
		itemName: string
		itemNumber?: string
		itemType: string
		itemClass: string
		itemGroup: string | null
	}
	quantity: number
	displayUnits: {
		id: string
		name: string
	} | null
	operation: string
}

export interface Recipe {
	id: string
	name: string
	active: boolean
	whiskeyType: 'RyeBourbon' | 'WheatBourbon' | 'StraightBourbon' | 'Rye'
	customer: string
	revision: number
	cooksPerFermenter: number
	mashingProtocolTemplate?: string
	createdAt: Date
	createdBy: string
	ingredients: RecipeIngredient[]
	parameters: RecipeParameter[]
	mashingSteps: MashingStep[]
}

// Helper interface for API items
interface ApiItem {
	id: string
	itemName: string
	itemNumber: string // Required since we filter for items with itemNumber
	itemType?: string
	itemClass?: string
	itemGroup?: string | null
}

// Generate ingredient categories dynamically based on available item groups
// This could be enhanced to fetch from API in the future
export const getIngredientCategories = () => [
	{ value: 'water' as const, label: 'Water' },
	{ value: 'grains' as const, label: 'Grains' },
	{ value: 'yeast' as const, label: 'Yeast' },
	{ value: 'enzymes' as const, label: 'Enzymes' },
	{ value: 'other' as const, label: 'Other' }
]

// Helper function to get default unit for a category
const getDefaultUnitForCategory = (category: IngredientCategory): string => {
	return category === 'enzymes' ? 'lbs/TotalGrainLoad' : 'kg'
}

/**
 * Categorize an ingredient based on its item group
 * This is a wrapper around the utility function for use in components
 */
export function categorizeIngredient(
	itemGroup: string | null | undefined,
	itemName?: string,
	itemNumber?: string
): IngredientCategory {
	return categorizeIngredientByItemGroup(itemGroup, itemName, itemNumber)
}

/**
 * Get display label for a category
 * This is a wrapper around the utility function for use in components
 */
export function getCategoryLabel(category: IngredientCategory): string {
	return getIngredientCategoryLabel(category)
}

// Recipe BOM Editor Component
export interface MashBillData {
	corn: number
	rye: number
	wheat: number
	maltedBarley: number
}

export function RecipeBOMEditor({
	ingredients,
	onIngredientsChange,
	isEditing = false,
	recipeId,
	mashBill,
	mashBillData
}: {
	ingredients: RecipeIngredient[]
	onIngredientsChange: (ingredients: RecipeIngredient[]) => void
	isEditing?: boolean
	recipeId?: string
	mashBill?: string
	mashBillData?: MashBillData
}) {
	console.log('🧪 RecipeBOMEditor props received:')
	console.log('🧪 - recipeId:', recipeId)
	console.log('🧪 - mashBill:', mashBill)
	console.log('🧪 - isEditing:', isEditing)
	console.log('🧪 - ingredients count:', ingredients.length)
	
	const [isAddModalOpen, setIsAddModalOpen] = useState(false)
	const [editingIngredient, setEditingIngredient] = useState<RecipeIngredient | null>(null)
	const getDefaultIngredient = (): RecipeIngredient => ({
		id: '',
		itemCode: '',
		name: '',
		quantity: 0,
		unit: getDefaultUnitForCategory('grains'),
		category: 'grains',
		notes: '',
		createdAt: new Date(),
		calculationMode: 'STATIC'
	})
	const [newIngredient, setNewIngredient] = useState<RecipeIngredient>(getDefaultIngredient)
	const [showFormulaConfig, setShowFormulaConfig] = useState(false)
	const [validationErrors, setValidationErrors] = useState<string[]>([])
	const [expressionSource, setExpressionSource] = useState<'library' | 'custom'>('library')

	// Query for formula libraries (for EXPRESSION mode)
	const { data: formulaLibrariesData, loading: formulaLibrariesLoading } = useQuery<{
		formulaLibraries: FormulaLibrary[]
	}>(GET_FORMULA_LIBRARIES, {
		variables: { filters: { isActive: true } },
		skip: !showFormulaConfig // Only fetch when formula config is shown
	})
	const formulaLibraries = formulaLibrariesData?.formulaLibraries || []

	// Lazy query for expression validation
	const [validateExpression, { loading: validatingExpression }] = useLazyQuery(VALIDATE_EXPRESSION)

	// Enzyme dosing calculation state
	const [isCalculatingEnzyme, setIsCalculatingEnzyme] = useState(false)
	const [enzymeCalculationError, setEnzymeCalculationError] = useState<string | null>(null)
	
	// Use the enzyme dosing hook
	const { 
		calculateSingleEnzymeDosing
	} = useEnzymeDosing()

	const ingredientCategories = getIngredientCategories()

	// Validate water and backset percentages
	const validateWaterBackset = useCallback((ingredientsList: RecipeIngredient[]) => {
		const waterIngredient = ingredientsList.find(ing => 
			ing.category === 'water' && 
			(ing.name.toLowerCase().includes('water') && !ing.name.toLowerCase().includes('backset'))
		)
		const backsetIngredient = ingredientsList.find(ing => 
			ing.category === 'water' && 
			ing.name.toLowerCase().includes('backset')
		)

		// Only validate if both water and backset are present and use percentage units
		if (waterIngredient && backsetIngredient && 
			waterIngredient.unit === '%' && backsetIngredient.unit === '%') {
			const validation = validateWaterBacksetPercentages(
				waterIngredient.quantity, 
				backsetIngredient.quantity
			)
			setValidationErrors(validation.errors)
		} else {
			setValidationErrors([])
		}
	}, [])

	// Validate whenever ingredients change
	useEffect(() => {
		validateWaterBackset(ingredients)
	}, [ingredients, validateWaterBackset])

	// Fetch items for selection
	const { data: itemsData, loading: itemsLoading } = useQuery(ITEM_QUERIES.GET_ITEMS, {
		variables: { take: 1000 },
		onCompleted: () => {
			console.log('✅ Items loaded successfully')
		},
		onError: (error) => {
			console.error('❌ Items query error:', error)
		}
	})

	const items: ApiItem[] = useMemo(() => itemsData?.items || [], [itemsData?.items])

	const handleAddIngredient = () => {
		// Only require itemCode, quantity, and unit - name is optional since many items have empty names in DB
		if (newIngredient.itemCode && newIngredient.quantity && newIngredient.unit) {
			const ingredient: RecipeIngredient = {
				id: `ing_${Date.now()}`,
				itemCode: newIngredient.itemCode,
				name: newIngredient.name || newIngredient.itemCode, // Fallback to itemCode if name is empty
				quantity: newIngredient.quantity,
				unit: newIngredient.unit,
				category: newIngredient.category || 'grains',
				operation: 'Mashing01',
				createdAt: new Date(),
				notes: newIngredient.notes || '',
				calculationMode: newIngredient.calculationMode || 'STATIC'
			}
			// Add optional formula fields only if they have values
			if (newIngredient.formulaType) {
				ingredient.formulaType = newIngredient.formulaType
			}
			if (newIngredient.formulaMultiplier !== undefined) {
				ingredient.formulaMultiplier = newIngredient.formulaMultiplier
			}
			if (newIngredient.customExpression) {
				ingredient.customExpression = newIngredient.customExpression
			}
			onIngredientsChange([...ingredients, ingredient])
			setNewIngredient(getDefaultIngredient())
			setShowFormulaConfig(false)
			setIsAddModalOpen(false)
		}
	}

	const handleRemoveIngredient = (id: string) => {
		onIngredientsChange(ingredients.filter(ing => ing.id !== id))
	}

	const handleEditIngredient = (ingredient: RecipeIngredient) => {
		console.log('✏️ Edit ingredient - Opening modal for:', {
			ingredient,
			currentCategory: ingredient.category
		})
		
		// Re-categorize the ingredient based on current logic to ensure it's up to date
		const recategorizedCategory = categorizeIngredientByItemGroup(
			ingredient.itemGroup, 
			ingredient.name, 
			ingredient.itemCode
		)
		
		console.log('🔄 Re-categorizing ingredient:', {
			originalCategory: ingredient.category,
			recategorizedCategory,
			itemGroup: ingredient.itemGroup,
			itemName: ingredient.name
		})
		
		// Find the matching item in our items list to get the correct itemNumber
		const matchingItem = items.find((item: ApiItem) => item.id === ingredient.itemCode)
		const itemNumberForSelect = matchingItem?.itemNumber || ingredient.itemCode
		
		console.log('🔍 Finding matching item for edit:', {
			ingredientItemCode: ingredient.itemCode,
			matchingItem: matchingItem ? {
				id: matchingItem.id,
				itemName: matchingItem.itemName,
				itemNumber: matchingItem.itemNumber
			} : 'NOT FOUND',
			itemNumberForSelect
		})
		
		setEditingIngredient(ingredient)

		// Normalize unit value to match UnitsSelect options
		const normalizeUnit = (unit: string | undefined, category: string): string => {
			if (!unit) return ''
			// Normalize percentage variations
			if (unit === 'Percentage' || unit === 'percent' || unit === 'PERCENT') return '%'
			// Normalize enzyme unit variations
			if (unit === 'lbs/Cook' || unit === 'LBS/COOK') return 'Lbs/Cook'
			if (unit === 'LBS/TOTALGRAIN' || unit === 'lbs/totalgrain') return 'lbs/TotalGrainLoad'
			// Normalize yeast unit variations
			if (unit === 'kg/Fermenter' || unit === 'KG/FERMENTER') return 'Kg/Fermenter'
			return unit
		}

		const normalizedUnit = normalizeUnit(ingredient.unit, recategorizedCategory)

		const editData = {
			...ingredient,
			itemCode: itemNumberForSelect, // Use itemNumber for the SearchableSelect
			category: recategorizedCategory, // Use the re-categorized category instead of the stored one
			unit: normalizedUnit, // Use normalized unit to match UnitsSelect options
			// Convert decimal to percentage for editing if unit is %
			quantity: (ingredient.unit === '%' || ingredient.unit === 'Percentage')
				? ingredient.quantity * 100
				: ingredient.quantity
		}
		setNewIngredient(editData)
		// Show formula config if ingredient has formula settings
		if (ingredient.calculationMode && ingredient.calculationMode !== 'STATIC') {
			setShowFormulaConfig(true)
		}
		console.log('✏️ Edit ingredient - Set newIngredient to:', {
			...editData,
			unit_value: editData.unit,
			unit_type: typeof editData.unit,
			all_fields: Object.keys(editData),
			name_value: editData.name,
			has_name: !!editData.name
		})
		setIsAddModalOpen(true)
	}

	const handleUpdateIngredient = () => {
		console.log('🔧 handleUpdateIngredient called:', {
			editingIngredient,
			newIngredient,
			hasItemCode: !!newIngredient.itemCode,
			hasName: !!newIngredient.name
		})

		// Allow update if ingredient has either an item code or a name
		if (editingIngredient && (newIngredient.itemCode || newIngredient.name)) {
			// Convert percentage back to decimal if unit is %
			const quantityToSave = (newIngredient.unit === '%' || newIngredient.unit === 'Percentage')
				? newIngredient.quantity / 100
				: newIngredient.quantity

			console.log('🔧 Updating ingredient:', {
				oldId: editingIngredient.id,
				newData: { ...newIngredient, quantity: quantityToSave }
			})

			const updatedIngredients = ingredients.map(ing =>
				ing.id === editingIngredient.id
					? { ...ing, ...newIngredient, quantity: quantityToSave }
					: ing
			)

			console.log('🔧 Updated ingredients:', updatedIngredients)

			onIngredientsChange(updatedIngredients)
			setEditingIngredient(null)
			setNewIngredient(getDefaultIngredient())
			setShowFormulaConfig(false)
			setIsAddModalOpen(false)
		} else {
			console.error('🔧 Update failed - validation error:', {
				hasEditingIngredient: !!editingIngredient,
				hasItemCode: !!newIngredient.itemCode,
				hasName: !!newIngredient.name
			})
		}
	}

	// Enzyme dosing calculation function
	const handleCalculateEnzymeDosing = async () => {
		console.log('🧪 Starting enzyme dosing calculation...')
		console.log('🧪 Current newIngredient:', newIngredient)
		console.log('🧪 Available props - recipeId:', recipeId, 'mashBill:', mashBill)
		
		if (!newIngredient.itemCode || newIngredient.category !== 'enzymes') {
			const error = 'Enzyme selection required for calculation'
			console.log('❌ Validation failed:', error)
			setEnzymeCalculationError(error)
			return
		}

		// Determine if we're in create or edit mode
		if (!recipeId && !mashBill) {
			const error = 'Recipe ID or mash bill required for calculation'
			console.log('❌ Mode detection failed:', error)
			setEnzymeCalculationError(error)
			return
		}

		console.log('🧪 Mode detected:', recipeId ? 'EDIT (using recipeId)' : 'CREATE (using mashBill)')

		setIsCalculatingEnzyme(true)
		setEnzymeCalculationError(null)

		try {
			const input = recipeId 
				? { recipeId, enzymeItemId: newIngredient.itemCode }
				: { mashBill: mashBill!, enzymeItemId: newIngredient.itemCode }

			console.log('🧪 Calling calculateSingleEnzymeDosing with input:', input)
			const result = await calculateSingleEnzymeDosing(input)
			console.log('🧪 Calculation result:', result)

			if (result) {
				// The normalizedDoseRatio from backend is already the correct value
				// for "Percent Per Total Grain Load" unit - use it directly as-is
				const calculatedQuantity = result.normalizedDoseRatio // Use the exact value from backend

				console.log('🧪 Calculated quantity:', calculatedQuantity, 'from ratio:', result.normalizedDoseRatio)

				// Update the quantity field with calculated value
				setNewIngredient(prev => ({
					...prev,
					quantity: calculatedQuantity // Use the exact value without rounding
				}))

				// Show success message or additional info
				console.log('✅ Enzyme dosing calculated successfully:', {
					enzyme: result.enzymeName,
					ratio: result.normalizedDoseRatio,
					quantity: calculatedQuantity,
					instructions: result.instructions
				})
			} else {
				const error = 'Failed to calculate enzyme dosing'
				console.log('❌ Calculation returned null:', error)
				setEnzymeCalculationError(error)
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to calculate enzyme dosing'
			console.log('❌ Calculation error:', error)
			setEnzymeCalculationError(errorMessage)
		} finally {
			setIsCalculatingEnzyme(false)
		}
	}

	const groupedIngredients = ingredients.reduce((acc, ing) => {
		// Re-categorize each ingredient to ensure it's up to date
		const currentCategory = categorizeIngredientByItemGroup(ing.itemGroup, ing.name, ing.itemCode)

		if (!acc[currentCategory]) {
			acc[currentCategory] = []
		}
		acc[currentCategory]!.push({
			...ing,
			category: currentCategory // Use the re-categorized category for display
		})
		return acc
	}, {} as Record<string, RecipeIngredient[]>)

	// Calculate grain percentage totals for validation
	const grainItems = ingredients.filter(ing => ing.unit === '%' && ing.category === 'grains')
	// Multiply by 100 since quantities are stored as decimals (0.05 = 5%)
	const grainPercentageTotal = grainItems.reduce((sum, ing) => sum + ((parseFloat(String(ing.quantity)) || 0) * 100), 0)
	const grainPercentageError = grainItems.length > 0 && Math.abs(grainPercentageTotal - 100) > 0.01
		? `Grain percentages must sum to 100% (current: ${grainPercentageTotal.toFixed(2)}%)`
		: null

	// Validate grain categories match mash bill (if mashBillData provided)
	let mashBillValidationErrors: string[] = []
	if (mashBillData && grainItems.length > 0) {
		// Calculate actual grain percentages from BOM
		const bomGrains = {
			corn: 0,
			rye: 0,
			wheat: 0,
			maltedBarley: 0
		}

		grainItems.forEach(ing => {
			const percentage = (parseFloat(String(ing.quantity)) || 0) * 100
			const itemName = ing.name.toLowerCase()
			const itemCode = ing.itemCode.toLowerCase()

			if (itemCode.includes('corn') || itemCode.includes('crn')) {
				bomGrains.corn += percentage
			} else if (itemCode.includes('rye')) {
				bomGrains.rye += percentage
			} else if (itemCode.includes('wheat') || itemCode.includes('wht')) {
				bomGrains.wheat += percentage
			} else if (itemCode.includes('malt') || itemCode.includes('bry') || itemCode.includes('barley')) {
				bomGrains.maltedBarley += percentage
			}
		})

		// Compare with mash bill (tolerance of 0.5%)
		const tolerance = 0.5
		if (Math.abs(bomGrains.corn - mashBillData.corn) > tolerance) {
			mashBillValidationErrors.push(`Corn: BOM ${bomGrains.corn.toFixed(1)}% vs Mash Bill ${mashBillData.corn.toFixed(1)}%`)
		}
		if (Math.abs(bomGrains.rye - mashBillData.rye) > tolerance) {
			mashBillValidationErrors.push(`Rye: BOM ${bomGrains.rye.toFixed(1)}% vs Mash Bill ${mashBillData.rye.toFixed(1)}%`)
		}
		if (Math.abs(bomGrains.wheat - mashBillData.wheat) > tolerance) {
			mashBillValidationErrors.push(`Wheat: BOM ${bomGrains.wheat.toFixed(1)}% vs Mash Bill ${mashBillData.wheat.toFixed(1)}%`)
		}
		if (Math.abs(bomGrains.maltedBarley - mashBillData.maltedBarley) > tolerance) {
			mashBillValidationErrors.push(`Malted Barley: BOM ${bomGrains.maltedBarley.toFixed(1)}% vs Mash Bill ${mashBillData.maltedBarley.toFixed(1)}%`)
		}
	}

	return (
		<div className="space-y-4">
			{/* Validation Errors */}
			{validationErrors.length > 0 && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertTitle>Water/Backset Percentage Issues</AlertTitle>
					<AlertDescription>
						<ul className="list-disc list-inside space-y-1">
							{validationErrors.map((error, index) => (
								<li key={index}>{error}</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			)}

			{/* Grain Percentage Validation */}
			{grainPercentageError && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertTitle>Grain Percentage Validation</AlertTitle>
					<AlertDescription>{grainPercentageError}</AlertDescription>
				</Alert>
			)}

			{/* Mash Bill Validation */}
			{mashBillValidationErrors.length > 0 && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertTitle>Mash Bill Mismatch</AlertTitle>
					<AlertDescription>
						<ul className="list-disc list-inside space-y-1">
							{mashBillValidationErrors.map((error, index) => (
								<li key={index}>{error}</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			)}

			{/* Grain Percentage Summary (when valid) */}
			{grainItems.length > 0 && !grainPercentageError && (
				<Alert>
					<AlertCircle className="h-4 w-4" />
					<AlertTitle>Grain Bill Summary</AlertTitle>
					<AlertDescription>
						Total grain percentage: {grainPercentageTotal.toFixed(2)}% ✓
					</AlertDescription>
				</Alert>
			)}

			<div className="flex justify-between items-center">
				<h3 className="text-lg font-semibold">Bill of Materials</h3>
				{isEditing && (
					<Button onClick={() => setIsAddModalOpen(true)} size="sm">
						<Plus className="w-4 h-4 mr-2" />
						Add Ingredient
					</Button>
				)}
			</div>

			{ingredients.length === 0 ? (
				<Card>
					<CardContent className="p-6 text-center text-muted-foreground">
						No Recipe BOM configured. Add ingredients to get started.
					</CardContent>
				</Card>
			) : (
				<div className="space-y-4">
					{Object.entries(groupedIngredients).map(([category, categoryIngredients]) => (
						<Card key={category}>
							<CardHeader className="pb-2">
								<CardTitle className="text-base capitalize">{category}</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-2">
									{categoryIngredients.map((ingredient) => (
										<div key={ingredient.id} className="flex items-center justify-between p-3 border rounded-lg">
											<div className="flex-1">
												<div className="flex items-center gap-2">
													<span className="font-medium">{ingredient.itemCode}</span>
													{ingredient.name && ingredient.name !== ingredient.itemCode && (
														<span className="text-sm text-muted-foreground">({ingredient.name})</span>
													)}
												</div>
												<div className="text-sm text-muted-foreground mt-1">
													{ingredient.unit === '%' || ingredient.unit === 'Percentage'
														? (ingredient.quantity * 100).toFixed(2)
														: ingredient.quantity} {ingredient.unit}
													{ingredient.unit === '%' && ingredient.category === 'water' && (
														<span className="text-blue-600 dark:text-blue-400 ml-1">(of total liquid)</span>
													)}
													{ingredient.operation && ` • ${ingredient.operation}`}
												</div>
											</div>
											{isEditing && (
												<div className="flex gap-2">
													<Button
														variant="outline"
														size="sm"
														onClick={() => handleEditIngredient(ingredient)}
													>
														Edit
													</Button>
													<Button
														variant="outline"
														size="sm"
														onClick={() => handleRemoveIngredient(ingredient.id)}
													>
														<Trash2 className="w-4 h-4" />
													</Button>
												</div>
											)}
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			{/* Add/Edit Ingredient Modal */}
			<FormModal
				key={editingIngredient ? `edit-${editingIngredient.id}` : 'add-new'}
				isOpen={isAddModalOpen}
				onClose={() => {
					setIsAddModalOpen(false)
					setEditingIngredient(null)
					setNewIngredient(getDefaultIngredient())
					setShowFormulaConfig(false)
				}}
				title={editingIngredient ? 'Edit Ingredient' : 'Add Ingredient'}
				description="Configure ingredient details for the recipe BOM"
				size="lg"
				footer={
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
							Cancel
						</Button>
						<Button onClick={editingIngredient ? handleUpdateIngredient : handleAddIngredient}>
							{editingIngredient ? 'Update' : 'Add'} Ingredient
						</Button>
					</div>
				}
			>
				<div className="max-h-[60vh] overflow-y-auto pr-2">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="itemCode">Item Code</Label>
							<SearchableSelect
								value={newIngredient.itemCode || ''}
								onValueChange={async (value) => {
									const selected = items.find((item: ApiItem) => item.itemNumber === value)
									console.log('🔍 SearchableSelect - Item selected:', {
										itemNumber: value,
										itemName: selected?.itemName,
										itemGroup: selected?.itemGroup,
										selectedItem: selected
									})

									const newCategory = selected ? categorizeIngredientByItemGroup(selected.itemGroup, selected.itemName, selected.itemNumber) : newIngredient.category
									console.log('🏷️ SearchableSelect - Category determined:', {
										itemGroup: selected?.itemGroup,
										itemName: selected?.itemName,
										itemNumber: selected?.itemNumber,
										determinedCategory: newCategory
									})

									// Set category-specific formula defaults when item is selected
									let formulaDefaults: Partial<RecipeIngredient> = {}
									if (selected) {
										switch (newCategory) {
											case 'grains':
												formulaDefaults = {
													calculationMode: 'FORMULA_GRAIN',
													formulaType: 'SIMPLE_RATIO'
												}
												break
											case 'water':
												formulaDefaults = {
													calculationMode: 'FORMULA_WATER',
													formulaType: 'BACKSET_PERCENTAGE'
												}
												break
											case 'enzymes':
												formulaDefaults = {
													calculationMode: 'ENZYME_NORMALIZED'
												}
												break
											default:
												formulaDefaults = {
													calculationMode: 'STATIC'
												}
												break
										}
									}

									const updatedIngredient = {
										...newIngredient,
										itemCode: value,
										name: selected?.itemName || newIngredient.name, // Preserve existing name if item not found
										category: newCategory,
										unit: selected ? getDefaultUnitForCategory(newCategory) : newIngredient.unit, // Preserve existing unit if item not found
										...formulaDefaults
									}

									console.log('📝 SearchableSelect - Setting newIngredient:', updatedIngredient)
									setNewIngredient(updatedIngredient)

									// 🧪 AUTO-CALCULATE ENZYME DOSING when enzyme is selected
									if (newCategory === 'enzymes' && selected?.id && (recipeId || mashBill)) {
										console.log('🧪 AUTO-ENZYME: Enzyme item selected, triggering automatic calculation')
										console.log('🧪 AUTO-ENZYME: Selected enzyme details:', {
											enzymeId: selected.id,
											enzymeName: selected.itemName,
											enzymeItemNumber: selected.itemNumber,
											recipeId,
											mashBill,
											mode: recipeId ? 'EDIT (recipeId)' : 'CREATE (mashBill)'
										})

										// Set loading state
										setIsCalculatingEnzyme(true)
										setEnzymeCalculationError(null)

										try {
											// 🔧 FIX: Use the selected item's ID (not itemNumber) for the calculation
											const input = recipeId 
												? { recipeId, enzymeItemId: selected.id }
												: { mashBill: mashBill!, enzymeItemId: selected.id }

											console.log('🧪 AUTO-ENZYME: Calling calculateSingleEnzymeDosing with input:', input)
											const result = await calculateSingleEnzymeDosing(input)
											console.log('🧪 AUTO-ENZYME: Calculation result:', result)

											if (result) {
												// The normalizedDoseRatio from backend is already the correct value
												// for "Percent Per Total Grain Load" unit - use it directly as-is
												const calculatedQuantity = result.normalizedDoseRatio // Use the exact value from backend

												console.log('🧪 Calculated quantity:', calculatedQuantity, 'from ratio:', result.normalizedDoseRatio)

												// Update the quantity field with calculated value
												setNewIngredient(prev => ({
													...prev,
													quantity: calculatedQuantity // Use the exact value without rounding
												}))

												// Show success message or additional info
												console.log('✅ Enzyme dosing calculated successfully:', {
														enzyme: result.enzymeName,
														ratio: result.normalizedDoseRatio,
														quantity: calculatedQuantity,
														instructions: result.instructions
												})
											} else {
												const error = 'Auto-calculation returned no result'
												console.log('❌ AUTO-ENZYME: Calculation returned null:', error)
												setEnzymeCalculationError(error)
											}
										} catch (error) {
											const errorMessage = error instanceof Error ? error.message : 'Auto-calculation failed'
											console.log('❌ AUTO-ENZYME: Calculation error:', error)
											setEnzymeCalculationError(errorMessage)
										} finally {
											setIsCalculatingEnzyme(false)
										}
									} else if (newCategory === 'enzymes') {
										console.log('🧪 AUTO-ENZYME: Enzyme selected but missing requirements:', {
											hasEnzymeId: !!selected?.id,
											hasRecipeId: !!recipeId,
											hasMashBill: !!mashBill,
											message: 'Recipe ID or mash bill required for automatic calculation'
										})
									} else {
										console.log('🧪 AUTO-ENZYME: Non-enzyme item selected, skipping auto-calculation')
									}
								}}
								options={items
									.filter((item: ApiItem) => {
										if (!item.itemNumber) return false
										
										// Filter by current category
										const itemCategory = categorizeIngredientByItemGroup(item.itemGroup, item.itemName, item.itemNumber)
										const currentCategory = newIngredient.category || 'grains'
										
										return itemCategory === currentCategory
									})
									.map((item: ApiItem, index: number) => ({
										value: item.itemNumber!,
										label: item.itemName,
										description: `ID: ${item.id}`,
										category: categorizeIngredientByItemGroup(item.itemGroup, item.itemName, item.itemNumber),
										key: `${item.itemNumber}-${item.id}-${index}` // Ensure unique keys
									}))}
								placeholder="Select item code"
								searchPlaceholder="Search items..."
								emptyMessage="No items found"
								loading={itemsLoading}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="category">Category</Label>
							<Select
								value={newIngredient.category || 'grains'}
								onValueChange={(value: string) => {
									console.log('🏷️ Category dropdown - Manual selection:', {
										selectedCategory: value,
										currentIngredient: newIngredient
									})

									// Determine the appropriate default unit based on category
									const defaultUnit = getDefaultUnitForCategory(value as IngredientCategory)

									// Set category-specific formula defaults
									let formulaDefaults: Pick<RecipeIngredient, 'calculationMode' | 'formulaType'> = {
										calculationMode: 'STATIC'
									} as Pick<RecipeIngredient, 'calculationMode' | 'formulaType'>

									switch (value) {
										case 'grains':
											// Grains use percentage formula based on grain load
											formulaDefaults = {
												calculationMode: 'FORMULA_GRAIN',
												formulaType: 'SIMPLE_RATIO'
											}
											break
										case 'water':
											// Water can use backset percentage formula
											formulaDefaults = {
												calculationMode: 'FORMULA_WATER',
												formulaType: 'BACKSET_PERCENTAGE'
											}
											break
										case 'enzymes':
											// Enzymes use the normalized enzyme dosing service
											formulaDefaults = {
												calculationMode: 'ENZYME_NORMALIZED'
											} as Pick<RecipeIngredient, 'calculationMode' | 'formulaType'>
											break
										case 'yeast':
										case 'other':
										default:
											// Yeast and other use static quantities
											formulaDefaults = {
												calculationMode: 'STATIC'
											} as Pick<RecipeIngredient, 'calculationMode' | 'formulaType'>
											break
									}

									// Create new ingredient without optional properties that should be cleared
									const updatedIngredient: RecipeIngredient = {
										...newIngredient,
										category: value as RecipeIngredient['category'],
										unit: defaultUnit,
										...formulaDefaults
									}
									// Clear optional formula properties when not needed
									delete updatedIngredient.formulaMultiplier
									delete updatedIngredient.customExpression
									delete updatedIngredient.formulaLibraryId
									delete updatedIngredient.expressionVariables
									delete updatedIngredient.expressionValidated
									setNewIngredient(updatedIngredient)
								}}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select category" />
								</SelectTrigger>
								<SelectContent>
									{ingredientCategories.map((cat) => (
										<SelectItem key={cat.value} value={cat.value}>
											{cat.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2 md:col-span-2">
							<Label htmlFor="name">Ingredient Name</Label>
							<Input
								id="name"
								value={newIngredient.name || ''}
								onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })}
								placeholder="Enter ingredient name"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="quantity">
								Quantity
								{isCalculatingEnzyme && newIngredient.category === 'enzymes' && (
									<span className="ml-2 text-sm text-blue-600 dark:text-blue-400 font-normal">
										(Auto-calculating...)
									</span>
								)}
							</Label>
							<div className="flex gap-2">
								<Input
									id="quantity"
									type="number"
									value={newIngredient.quantity || 0}
									onChange={(e) => {
										const qty = Number(e.target.value)
										const updated: RecipeIngredient = { ...newIngredient, quantity: qty }

										// Auto-update formula multiplier for grain/water formulas
										// If quantity is a percentage (0-100), convert to decimal multiplier
										if (updated.calculationMode === 'FORMULA_GRAIN' || updated.calculationMode === 'FORMULA_WATER') {
											if (qty > 0 && qty <= 100) {
												updated.formulaMultiplier = qty / 100
											} else if (qty > 0 && qty <= 1) {
												// Already a decimal ratio
												updated.formulaMultiplier = qty
											}
										}

										setNewIngredient(updated)
									}}
									placeholder={isCalculatingEnzyme && newIngredient.category === 'enzymes' ? "Calculating..." : "0"}
									min="0"
									step="0.01"
									className={`flex-1 ${isCalculatingEnzyme && newIngredient.category === 'enzymes' ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700' : ''}`}
									disabled={isCalculatingEnzyme && newIngredient.category === 'enzymes'}
								/>
								{/* Calculate button for enzymes - now shows auto-calculation status */}
								{newIngredient.category === 'enzymes' && newIngredient.itemCode && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={handleCalculateEnzymeDosing}
										disabled={isCalculatingEnzyme || (!recipeId && !mashBill)}
										className="px-3"
										title={isCalculatingEnzyme ? "Auto-calculating enzyme dosing..." : "Manually recalculate enzyme dosing"}
									>
										{isCalculatingEnzyme ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<Calculator className="h-4 w-4" />
										)}
									</Button>
								)}
							</div>
							{/* Auto-calculation status messages */}
							{newIngredient.category === 'enzymes' && isCalculatingEnzyme && (
								<div className="text-sm text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
									<Loader2 className="h-3 w-3 animate-spin" />
									Auto-calculating enzyme dosing based on recipe composition...
								</div>
							)}
							{/* Enzyme calculation error display */}
							{enzymeCalculationError && (
								<div className="text-sm text-red-600 dark:text-red-400 mt-1">
									❌ {enzymeCalculationError}
								</div>
							)}
							{/* Success message for auto-calculation */}
							{newIngredient.category === 'enzymes' && !isCalculatingEnzyme && !enzymeCalculationError && newIngredient.quantity > 0 && (
								<div className="text-sm text-green-600 dark:text-green-400 mt-1">
									✅ Enzyme dosing auto-calculated successfully
								</div>
							)}
							{/* Enzyme calculation requirement hint */}
							{newIngredient.category === 'enzymes' && !recipeId && !mashBill && (
								<div className="text-sm text-muted-foreground mt-1">
									💡 Recipe ID or mash bill required for automatic enzyme dosing calculation
								</div>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="unit">Unit</Label>
							{(() => {
								const unitType = newIngredient.category === 'grains' ? 'grain' :
									newIngredient.category === 'yeast' ? 'yeast' :
									newIngredient.category === 'enzymes' ? 'enzyme' :
									'weight';
								console.log('🔧 UnitsSelect render:', {
									category: newIngredient.category,
									unitType,
									currentValue: newIngredient.unit,
									valueLength: newIngredient.unit?.length
								});
								return null;
							})()}
							<UnitsSelect
								value={newIngredient.unit || ''}
								onValueChange={(value) => setNewIngredient({ ...newIngredient, unit: value })}
								type={
									newIngredient.category === 'grains' ? 'grain' :
									newIngredient.category === 'yeast' ? 'yeast' :
									newIngredient.category === 'enzymes' ? 'enzyme' :
									newIngredient.category === 'water' ? 'volume' :
									'weight'
								}
								placeholder="Select unit"
							/>
							{/* Unit help text */}
							{newIngredient.category === 'grains' && (
								<div className="text-sm text-muted-foreground mt-1">
									💡 Grains use percentage (%) - total must equal 100%
								</div>
							)}
							{newIngredient.category === 'yeast' && (
								<div className="text-sm text-muted-foreground mt-1">
									💡 Yeast uses Kg/Fermenter - quantity per individual fermenter
								</div>
							)}
							{newIngredient.category === 'enzymes' && (
								<div className="text-sm text-muted-foreground mt-1">
									💡 Enzymes use Lbs/Cook - quantity per cook or per total grain load
								</div>
							)}
						</div>

						{/* Formula Configuration Section */}
						<div className="md:col-span-2 border-t pt-4 mt-4">
							<div className="flex items-center justify-between mb-4">
								<div>
									<Label className="text-base font-semibold">Formula Configuration</Label>
									<p className="text-sm text-muted-foreground">
										Configure how quantity is calculated when instantiating to a schedule order
									</p>
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setShowFormulaConfig(!showFormulaConfig)}
								>
									{showFormulaConfig ? 'Hide' : 'Show'} Configuration
								</Button>
							</div>

							{showFormulaConfig && (
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
									<div className="space-y-2">
										<Label htmlFor="calculationMode">Calculation Mode</Label>
										<Select
											value={newIngredient.calculationMode || 'STATIC'}
											onValueChange={(value: string) => {
												const mode = value as BomCalculationMode
												const updated: RecipeIngredient = {
													...newIngredient,
													calculationMode: mode
												}
												// Auto-set formula type when mode changes
												if (mode === 'FORMULA_GRAIN') {
													updated.formulaType = 'SIMPLE_RATIO'
												} else if (mode === 'FORMULA_WATER') {
													updated.formulaType = 'BACKSET_PERCENTAGE'
												}
												// Clear formula type for other modes
												if (mode !== 'FORMULA_GRAIN' && mode !== 'FORMULA_WATER') {
													delete updated.formulaType
												}
												// Auto-calculate multiplier from quantity when switching to formula mode
												if ((mode === 'FORMULA_GRAIN' || mode === 'FORMULA_WATER') && updated.quantity) {
													const qty = updated.quantity
													if (qty > 0 && qty <= 100) {
														updated.formulaMultiplier = qty / 100
													} else if (qty > 0 && qty <= 1) {
														updated.formulaMultiplier = qty
													}
												}
												setNewIngredient(updated)
											}}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select calculation mode" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="STATIC">
													<div className="flex flex-col">
														<span>Static</span>
														<span className="text-xs text-muted-foreground">Use quantity directly</span>
													</div>
												</SelectItem>
												<SelectItem value="FORMULA_GRAIN">
													<div className="flex flex-col">
														<span>Formula - Grain Load</span>
														<span className="text-xs text-muted-foreground">Calculate from grain load</span>
													</div>
												</SelectItem>
												<SelectItem value="FORMULA_WATER">
													<div className="flex flex-col">
														<span>Formula - Water Load</span>
														<span className="text-xs text-muted-foreground">Calculate from water load</span>
													</div>
												</SelectItem>
												<SelectItem value="ENZYME_NORMALIZED">
													<div className="flex flex-col">
														<span>Enzyme Normalized</span>
														<span className="text-xs text-muted-foreground">Use enzyme dosing service</span>
													</div>
												</SelectItem>
												<SelectItem value="EXPRESSION">
													<div className="flex flex-col">
														<span>Expression</span>
														<span className="text-xs text-muted-foreground">Custom formula expression</span>
													</div>
												</SelectItem>
											</SelectContent>
										</Select>
									</div>

									{(newIngredient.calculationMode === 'FORMULA_GRAIN' ||
									  newIngredient.calculationMode === 'FORMULA_WATER') && (
										<>
											<div className="space-y-2">
												<Label htmlFor="formulaType">Formula Type</Label>
												<Select
													value={newIngredient.formulaType || 'SIMPLE_RATIO'}
													onValueChange={(value: string) => setNewIngredient({
														...newIngredient,
														formulaType: value as BomFormulaType
													})}
												>
													<SelectTrigger>
														<SelectValue placeholder="Select formula type" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="SIMPLE_RATIO">Simple Ratio</SelectItem>
														<SelectItem value="WATER_PER_BUSHEL">Water per Bushel</SelectItem>
														<SelectItem value="BACKSET_PERCENTAGE">Backset Percentage</SelectItem>
														<SelectItem value="CUSTOM">Custom</SelectItem>
													</SelectContent>
												</Select>
											</div>

											<div className="space-y-2">
												<Label htmlFor="formulaMultiplier">
													Formula Multiplier
													<span className="text-xs text-green-600 dark:text-green-400 ml-2">
														(auto-synced from %)
													</span>
												</Label>
												<div className="flex items-center gap-2">
													<Input
														id="formulaMultiplier"
														type="number"
														value={newIngredient.formulaMultiplier || ''}
														onChange={(e) => {
															const updated: RecipeIngredient = { ...newIngredient }
															if (e.target.value) {
																updated.formulaMultiplier = Number(e.target.value)
															} else {
																delete updated.formulaMultiplier
															}
															setNewIngredient(updated)
														}}
														placeholder="0.70"
														step="0.01"
														min="0"
														className="bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700"
													/>
													{newIngredient.quantity && newIngredient.formulaMultiplier && (
														<span className="text-xs text-green-700 dark:text-green-400 whitespace-nowrap">
															= {(newIngredient.formulaMultiplier * 100).toFixed(1)}%
														</span>
													)}
												</div>
												<p className="text-xs text-muted-foreground">
													Derived from quantity: {newIngredient.quantity || 0}% → {newIngredient.formulaMultiplier?.toFixed(4) || '0'}
												</p>
											</div>

											<div className="md:col-span-2 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700">
												<p className="text-sm text-blue-800 dark:text-blue-200">
													<strong>Preview:</strong>{' '}
													{newIngredient.calculationMode === 'FORMULA_GRAIN'
														? `grainLoad × ${newIngredient.formulaMultiplier || '?'}`
														: `waterLoad × ${newIngredient.formulaMultiplier || '?'}`
													}
													{newIngredient.formulaMultiplier && (
														<span className="ml-2">
															= {(3000 * (newIngredient.formulaMultiplier || 0)).toFixed(0)} lbs (at 3000 lb load)
														</span>
													)}
												</p>
											</div>
										</>
									)}

									{newIngredient.calculationMode === 'EXPRESSION' && (
										<div className="md:col-span-2 space-y-4">
											{/* Expression Source Toggle */}
											<div className="space-y-2">
												<Label>Expression Source</Label>
												<RadioGroup
													value={newIngredient.formulaLibraryId ? 'library' : (newIngredient.customExpression ? 'custom' : expressionSource)}
													onValueChange={(value: string) => {
														setExpressionSource(value as 'library' | 'custom')
														const updated: RecipeIngredient = { ...newIngredient }
														if (value === 'library') {
															delete updated.customExpression
														} else {
															delete updated.formulaLibraryId
														}
														setNewIngredient(updated)
													}}
													className="flex gap-4"
												>
													<div className="flex items-center space-x-2">
														<RadioGroupItem value="library" id="expr-library" />
														<Label htmlFor="expr-library" className="font-normal cursor-pointer">
															Formula Library
														</Label>
													</div>
													<div className="flex items-center space-x-2">
														<RadioGroupItem value="custom" id="expr-custom" />
														<Label htmlFor="expr-custom" className="font-normal cursor-pointer">
															Custom Expression
														</Label>
													</div>
												</RadioGroup>
											</div>

											{/* Formula Library Selector */}
											{(expressionSource === 'library' && !newIngredient.customExpression) && (
												<div className="space-y-2">
													<Label htmlFor="formulaLibrary">Select Formula</Label>
													{formulaLibrariesLoading ? (
														<div className="flex items-center gap-2 text-sm text-muted-foreground">
															<Loader2 className="w-4 h-4 animate-spin" />
															Loading formulas...
														</div>
													) : formulaLibraries.length === 0 ? (
														<p className="text-sm text-muted-foreground">
															No formulas available. Create formulas in the Formula Library to use here.
														</p>
													) : (
														<>
															<Select
																value={newIngredient.formulaLibraryId || ''}
																onValueChange={(value: string) => {
																	const updated: RecipeIngredient = { ...newIngredient }
																	if (value) {
																		updated.formulaLibraryId = value
																	} else {
																		delete updated.formulaLibraryId
																	}
																	setNewIngredient(updated)
																}}
															>
																<SelectTrigger>
																	<SelectValue placeholder="Select a formula..." />
																</SelectTrigger>
																<SelectContent>
																	{formulaLibraries.map((formula) => (
																		<SelectItem key={formula.id} value={formula.id}>
																			<div className="flex flex-col">
																				<span>{formula.name}</span>
																				{formula.category && (
																					<span className="text-xs text-muted-foreground">
																						{formula.category}
																					</span>
																				)}
																			</div>
																		</SelectItem>
																	))}
																</SelectContent>
															</Select>

															{/* Show selected formula details */}
															{newIngredient.formulaLibraryId && (() => {
																const selectedFormula = formulaLibraries.find(f => f.id === newIngredient.formulaLibraryId)
																if (!selectedFormula) return null
																return (
																	<div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg space-y-2 border border-blue-200 dark:border-blue-700">
																		<p className="text-sm font-medium text-blue-900 dark:text-blue-100">{selectedFormula.name}</p>
																		{selectedFormula.description && (
																			<p className="text-xs text-blue-700 dark:text-blue-300">{selectedFormula.description}</p>
																		)}
																		<div className="p-2 bg-white dark:bg-gray-800 rounded border dark:border-gray-600 font-mono text-xs">
																			{selectedFormula.expression}
																		</div>
																		{selectedFormula.requiredVariables.length > 0 && (
																			<p className="text-xs text-blue-600 dark:text-blue-400">
																				Variables: {selectedFormula.requiredVariables.join(', ')}
																			</p>
																		)}
																	</div>
																)
															})()}
														</>
													)}
												</div>
											)}

											{/* Custom Expression Input */}
											{(expressionSource === 'custom' || newIngredient.customExpression) && (
												<div className="space-y-2">
													<Label htmlFor="customExpression">Custom Expression</Label>
													<Textarea
														id="customExpression"
														value={newIngredient.customExpression || ''}
														onChange={(e) => {
															const updated: RecipeIngredient = {
																...newIngredient,
																customExpression: e.target.value
															}
															delete updated.formulaLibraryId // Clear library selection
															setNewIngredient(updated)
														}}
														placeholder="grainLoad * 0.70"
														className="font-mono text-sm"
														rows={2}
													/>
													<div className="text-xs text-muted-foreground space-y-1">
														<p><strong>Variables:</strong> grainLoad, waterLoad, corn, rye, wheat, malt, mashBill</p>
														<p><strong>Functions:</strong> IF(cond, true, false), ROUND, FLOOR, CEIL, MIN, MAX, BUSHELS, METRIC_TONS</p>
														<p><strong>Example:</strong> <code className="bg-muted px-1 rounded">grainLoad * 0.70</code> or <code className="bg-muted px-1 rounded">IF(corn &gt; 50, grainLoad * 0.7, grainLoad * 0.6)</code></p>
													</div>
												</div>
											)}
										</div>
									)}

									{newIngredient.calculationMode === 'ENZYME_NORMALIZED' && (
										<div className="md:col-span-2 p-3 bg-amber-50 dark:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-700">
											<p className="text-sm text-amber-800 dark:text-amber-200">
												<strong>Note:</strong> Enzyme normalized mode uses the enzyme dosing
												service to calculate quantities based on grain composition and
												enzyme configuration.
											</p>
										</div>
									)}
								</div>
							)}
						</div>
					</div>
				</div>
			</FormModal>
		</div>
	)
}

// Recipe Parameters Editor Component
export function RecipeParametersEditor({
	parameters,
	onParametersChange,
	isEditing = false
}: {
	parameters: RecipeParameter[]
	onParametersChange: (parameters: RecipeParameter[]) => void
	isEditing?: boolean
}) {
	const [isAddModalOpen, setIsAddModalOpen] = useState(false)
	const [newParameter, setNewParameter] = useState<Partial<RecipeParameter>>({
		name: '',
		description: '',
		type: 'numeric',
		value: '',
		unit: ''
	})

	const commonParameters = [
		{ name: 'HighWineProof', description: 'High Wine Distillation Proof', type: 'numeric', defaultValue: 140, unit: 'proof' },
		{ name: 'LowWineProof', description: 'Low Wine Distillation Proof', type: 'numeric', defaultValue: 130, unit: 'proof' },
		{ name: 'BaseLoss', description: 'Base Loss Percentage', type: 'numeric', defaultValue: 0.1, unit: '%' },
		{ name: 'BeerFeedTray', description: 'Beer Feed Tray Number', type: 'numeric', defaultValue: 15, unit: '' },
		{ name: 'CooksPerFerm', description: 'Cooks Per Fermenter', type: 'numeric', defaultValue: 3, unit: '' },
		{ name: 'TopOffFrequency', description: 'Top Off Frequency', type: 'numeric', defaultValue: 24, unit: 'hours' },
		{ name: 'MashRatio', description: 'Mash Ratio', type: 'numeric', defaultValue: 3, unit: '' },
		{ name: 'RatioByFerm', description: 'Ratio By Fermenter', type: 'numeric', defaultValue: 2.8, unit: '' },
		{ name: 'StarterSweetoH', description: 'Starter Sweet on Hand', type: 'numeric', defaultValue: 5.1, unit: 'pH' },
		{ name: 'IsFourGrain', description: 'Four Grain Recipe', type: 'boolean', defaultValue: false, unit: '' },
		{ name: 'SetTemp', description: 'Set Temperature', type: 'numeric', defaultValue: 180, unit: '°F' }
	]

	const handleAddParameter = () => {
		if (newParameter.name && newParameter.description && newParameter.type) {
			const parameter: RecipeParameter = {
				id: `param_${Date.now()}`,
				name: newParameter.name,
				description: newParameter.description,
				type: newParameter.type,
				value: newParameter.value || '',
				unit: newParameter.unit || '',
				createdAt: new Date()
			}
			onParametersChange([...parameters, parameter])
			setNewParameter({ name: '', description: '', type: 'numeric', value: '', unit: '' })
			setIsAddModalOpen(false)
		}
	}

	const handleRemoveParameter = (id: string) => {
		onParametersChange(parameters.filter(param => param.id !== id))
	}

	const handleUpdateParameterValue = (id: string, value: string | number | boolean) => {
		const updatedParameters = parameters.map(param =>
			param.id === id ? { ...param, value } : param
		)
		onParametersChange(updatedParameters)
	}

	return (
		<div className="space-y-4">
			<div className="flex justify-between items-center">
				<h3 className="text-lg font-semibold">Recipe Parameters</h3>
				{isEditing && (
					<Button onClick={() => setIsAddModalOpen(true)} size="sm">
						<Plus className="w-4 h-4 mr-2" />
						Add Parameter
					</Button>
				)}
			</div>

			{parameters.length === 0 ? (
				<Card>
					<CardContent className="p-6 text-center text-muted-foreground">
						No parameters configured. Add parameters to customize the recipe.
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardContent className="p-0">
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead className="bg-muted/50 border-b">
									<tr>
										<th className="px-4 py-3 text-left text-sm font-medium w-[180px]">Name</th>
										<th className="px-4 py-3 text-left text-sm font-medium">Description</th>
										<th className="px-4 py-3 text-left text-sm font-medium w-[100px]">Type</th>
										<th className="px-4 py-3 text-left text-sm font-medium w-[100px]">Category</th>
										<th className="px-4 py-3 text-left text-sm font-medium w-[180px]">Value</th>
										{isEditing && <th className="px-4 py-3 text-center text-sm font-medium w-[100px]">Actions</th>}
									</tr>
								</thead>
								<tbody>
									{parameters.map((parameter, index) => {
										// ProcessingActual, Output, Calculated categories should not be deletable
										const isNonDeletableCategory = parameter.category === 'Output' ||
											parameter.category === 'Calculated' ||
											parameter.category === 'ProcessingActual'
										const canDelete = !isNonDeletableCategory
										return (
											<tr key={parameter.id} className={`border-b last:border-0 ${index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}`}>
												<td className="px-4 py-3 font-medium text-sm">{parameter.name}</td>
												<td className="px-4 py-3 text-sm text-muted-foreground max-w-[400px] truncate" title={parameter.description}>
													{parameter.description}
												</td>
												<td className="px-4 py-3">
													<Badge variant="outline" className="text-xs">{parameter.type}</Badge>
												</td>
												<td className="px-4 py-3">
													{parameter.category && (
														<Badge
															variant={parameter.category === 'Input' ? 'default' : 'secondary'}
															className={`text-xs ${parameter.category === 'Output' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200' : parameter.category === 'Calculated' ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200' : ''}`}
														>
															{parameter.category}
														</Badge>
													)}
												</td>
												<td className="px-4 py-3">
													{isEditing ? (
														<div className="flex items-center gap-2">
															{parameter.type === 'boolean' ? (
																<Checkbox
																	checked={Boolean(parameter.value)}
																	onCheckedChange={(checked: boolean) => handleUpdateParameterValue(parameter.id, checked)}
																/>
															) : (
																<Input
																	type={parameter.type === 'numeric' ? 'number' : 'text'}
																	value={String(parameter.value)}
																	onChange={(e) => handleUpdateParameterValue(parameter.id,
																		parameter.type === 'numeric' ? Number(e.target.value) : e.target.value
																	)}
																	className="h-8 w-24"
																	step="any"
																/>
															)}
															{parameter.unit && (
																<span className="text-xs text-muted-foreground whitespace-nowrap">{parameter.unit}</span>
															)}
														</div>
													) : (
														<span className="text-sm">
															{parameter.type === 'boolean'
																? (parameter.value ? 'Yes' : 'No')
																: `${parameter.value}${parameter.unit ? ` ${parameter.unit}` : ''}`
															}
														</span>
													)}
												</td>
												{isEditing && (
													<td className="px-4 py-3 text-center">
														{canDelete ? (
															<Button
																variant="ghost"
																size="sm"
																onClick={() => handleRemoveParameter(parameter.id)}
																className="h-8 w-8 p-0"
															>
																<Trash2 className="w-4 h-4 text-destructive" />
															</Button>
														) : (
															<span className="text-xs text-muted-foreground" title="Output/Calculated parameters cannot be deleted">
																—
															</span>
														)}
													</td>
												)}
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Add Parameter Modal */}
			<FormModal
				isOpen={isAddModalOpen}
				onClose={() => {
					setIsAddModalOpen(false)
					setNewParameter({ name: '', description: '', type: 'numeric', value: '', unit: '' })
				}}
				title="Add Parameter"
				description="Configure a new recipe parameter"
				size="lg"
				footer={
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
							Cancel
						</Button>
						<Button onClick={handleAddParameter}>
							Add Parameter
						</Button>
					</div>
				}
			>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="space-y-2">
						<Label htmlFor="paramName">Parameter Name</Label>
						<Select
							value={newParameter.name || ''}
							onValueChange={(value) => {
								const selected = commonParameters.find(p => p.name === value)
								if (selected) {
									setNewParameter({
										...newParameter,
										name: value,
										description: selected.description,
										type: selected.type as RecipeParameter['type'],
										value: selected.defaultValue,
										unit: selected.unit
									})
								} else {
									setNewParameter({ ...newParameter, name: value })
								}
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select parameter" />
							</SelectTrigger>
							<SelectContent>
								{commonParameters.map((param) => (
									<SelectItem key={param.name} value={param.name}>
										{param.name} - {param.description}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="paramType">Type</Label>
						<Select
							value={newParameter.type || 'numeric'}
							onValueChange={(value) => setNewParameter({ ...newParameter, type: value as RecipeParameter['type'] })}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="numeric">Numeric</SelectItem>
								<SelectItem value="boolean">Boolean</SelectItem>
								<SelectItem value="text">Text</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2 md:col-span-2">
						<Label htmlFor="paramDescription">Description</Label>
						<Input
							id="paramDescription"
							value={newParameter.description || ''}
							onChange={(e) => setNewParameter({ ...newParameter, description: e.target.value })}
							placeholder="Enter parameter description"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="paramValue">Default Value</Label>
						<Input
							id="paramValue"
							type={newParameter.type === 'numeric' ? 'number' : 'text'}
							value={newParameter.type === 'boolean' ? '' : String(newParameter.value || '')}
							onChange={(e) => setNewParameter({ 
								...newParameter, 
								value: newParameter.type === 'numeric' ? Number(e.target.value) : e.target.value 
							})}
							placeholder="Enter default value"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="paramUnit">Unit (Optional)</Label>
						<Input
							id="paramUnit"
							value={newParameter.unit || ''}
							onChange={(e) => setNewParameter({ ...newParameter, unit: e.target.value })}
							placeholder="e.g., °F, %, proof"
						/>
					</div>
				</div>
			</FormModal>
		</div>
	)
}

// Mashing Protocol Editor Component  
export function MashingProtocolEditor({
	steps,
	onStepsChange,
	isEditing = false
}: {
	steps: MashingStep[]
	onStepsChange: (steps: MashingStep[]) => void
	isEditing?: boolean
}) {
	const [isAddModalOpen, setIsAddModalOpen] = useState(false)
	const [editingStep, setEditingStep] = useState<MashingStep | null>(null)
	const [newStep, setNewStep] = useState<Partial<MashingStep>>({
		stepType: 'Hold',
		holdType: 'None',
		additiveType: '',
		included: true,
		notes: ''
	})
	const [insertPosition, setInsertPosition] = useState<number | null>(null)
	const [stepToDelete, setStepToDelete] = useState<string | null>(null)

	// Fetch items for selection
	const { data: itemsData, loading: itemsLoading } = useQuery(ITEM_QUERIES.GET_ITEMS, {
		variables: { take: 1000 },
		onCompleted: () => {
			console.log('✅ Items loaded successfully')
		},
		onError: (error) => {
			console.error('❌ Items query error:', error)
		}
	})

	const items: ApiItem[] = useMemo(() => itemsData?.items || [], [itemsData?.items])

	const stepTypes = [
		{ value: 'LiquidAdd', label: 'Liquid Add' },
		{ value: 'Hold', label: 'Hold' },
		{ value: 'AdditiveAdd', label: 'Additive Add' },
		{ value: 'Malt', label: 'Malt' },
		{ value: 'Corn', label: 'Corn' },
		{ value: 'Rye', label: 'Rye' },
		{ value: 'Wheat', label: 'Wheat' }
	]

	const holdTypes = [
		{ value: 'None', label: 'None' },
		{ value: 'Heat', label: 'Heat' },
		{ value: 'Cool', label: 'Cool' }
	]

	const additiveTypes = [
		'ENZ-GUS02-Enzyme',
		'ENZ-UNI04-Enzyme', 
		'CIT-TMP01-Citric',
		'CAL-CHL01-Calcium',
		'YST-DST01-Yeast'
	]

	// Helper function to check if step type requires item selection
	const requiresItemSelection = (stepType: string) => {
		return ['Corn', 'Wheat', 'Rye', 'Malt', 'AdditiveAdd', 'LiquidAdd'].includes(stepType)
	}

	// Helper function to filter items based on step type
	const getFilteredItems = (stepType: string) => {
		if (!stepType) return items

		switch (stepType) {
			case 'LiquidAdd':
				// For liquid steps, show items with water-related item groups
				return items.filter((item: ApiItem) => {
					const itemGroup = item.itemGroup?.toUpperCase()
					return itemGroup === 'RM-WATER' || itemGroup === 'RM-LIQ' || 
						   itemGroup?.includes('WATER') || itemGroup?.includes('LIQUID') ||
						   item.itemName.toLowerCase().includes('water') ||
						   item.itemName.toLowerCase().includes('backset')
				})
			case 'AdditiveAdd':
				// For additive steps, only show items with specific item groups
				return items.filter((item: ApiItem) => {
					const itemGroup = item.itemGroup?.toUpperCase()
					return itemGroup === 'RM-ENZ' || itemGroup === 'RM-YEA' || itemGroup === 'RM-ADD'
				})
			case 'Malt':
				// For malt steps, show items with grain-related item groups
				return items.filter((item: ApiItem) => {
					const itemGroup = item.itemGroup?.toUpperCase()
					return itemGroup?.startsWith('RM-GR-') || itemGroup === 'RM-MLT'
				})
			case 'Corn':
			case 'Wheat':
			case 'Rye':
				// For grain steps, show items with grain-related item groups
				return items.filter((item: ApiItem) => {
					const itemGroup = item.itemGroup?.toUpperCase()
					return itemGroup?.startsWith('RM-GR-')
				})
			default:
				return items
		}
	}

	// Helper function to auto-populate water and backset for LiquidAdd steps
	const autoPopulateWaterBackset = useCallback(() => {
		if (newStep.stepType !== 'LiquidAdd') return

		// Find water item - check for various water item names
		const waterItem = items.find((item: ApiItem) => {
			const itemName = item.itemName.toLowerCase()
			const itemNumber = item.itemNumber?.toLowerCase()
			return itemName === 'water' || 
				   itemNumber === 'water' ||
				   itemName.includes('water') ||
				   itemNumber?.includes('water')
		})

		// Auto-populate with water if available and not already selected
		if (waterItem && !newStep.selectedItemId) {
			setNewStep(prev => ({
				...prev,
				selectedItemId: waterItem.id,
				itemQuantity: 1000 // Default water quantity
			}))
		}

		// Set default water and backset quantities if not already set
		if (!newStep.waterQuantity) {
			setNewStep(prev => ({ ...prev, waterQuantity: 1000 }))
		}
		if (!newStep.backsetQuantity) {
			setNewStep(prev => ({ ...prev, backsetQuantity: 300 }))
		}
	}, [newStep.stepType, newStep.selectedItemId, newStep.waterQuantity, newStep.backsetQuantity, items])

	// Auto-populate when step type changes to LiquidAdd
	useEffect(() => {
		if (newStep.stepType === 'LiquidAdd' && items.length > 0) {
			autoPopulateWaterBackset()
		}
	}, [newStep.stepType, items.length, autoPopulateWaterBackset])

	// Helper function to update newStep state safely
	const updateNewStep = (updates: Partial<MashingStep>) => {
		setNewStep(prev => ({ ...prev, ...updates }))
	}

	// Helper function to safely update number fields
	const updateNumberField = (field: keyof MashingStep, value: string) => {
		const numValue = value ? Number(value) : undefined
		if (value && isNaN(numValue as number)) {
			return // Don't update if invalid number
		}
		updateNewStep({ [field]: numValue } as Partial<MashingStep>)
	}

	const handleAddStep = () => {
		if (newStep.stepType) {
			let nextIndex: number
			let insertAtIndex: number

			if (insertPosition !== null && insertPosition > 0 && insertPosition <= steps.length + 1) {
				// Insert at specific position
				nextIndex = insertPosition
				insertAtIndex = insertPosition - 1 // Convert to 0-based index
			} else {
				// Add at the end (default behavior)
				const maxIndex = steps.length > 0 ? Math.max(...steps.map(s => s.index)) : 0
				nextIndex = maxIndex + 1
				insertAtIndex = steps.length
			}

			const step: MashingStep = {
				id: `step_${Date.now()}`,
				index: nextIndex,
				stepType: newStep.stepType,
				included: newStep.included ?? true,
			}
			
			// Only add optional properties if they have values
			if (newStep.holdType && newStep.holdType !== 'None') {
				step.holdType = newStep.holdType
			}
			if (newStep.heatTempSp !== undefined && newStep.heatTempSp !== null && !isNaN(newStep.heatTempSp)) {
				step.heatTempSp = newStep.heatTempSp
			}
			if (newStep.coolTempSp !== undefined && newStep.coolTempSp !== null && !isNaN(newStep.coolTempSp)) {
				step.coolTempSp = newStep.coolTempSp
			}
			if (newStep.timeDuration !== undefined && newStep.timeDuration !== null && !isNaN(newStep.timeDuration)) {
				step.timeDuration = newStep.timeDuration
			}
			if (newStep.waterBacksetSP !== undefined && newStep.waterBacksetSP !== null && !isNaN(newStep.waterBacksetSP)) {
				step.waterBacksetSP = newStep.waterBacksetSP
			}
			if (newStep.additiveType) {
				step.additiveType = newStep.additiveType
			}
			if (newStep.notes) {
				step.notes = newStep.notes
			}
			if (newStep.selectedItemId) {
				step.selectedItemId = newStep.selectedItemId
			}
			if (newStep.itemQuantity !== undefined && newStep.itemQuantity !== null && !isNaN(newStep.itemQuantity)) {
				step.itemQuantity = newStep.itemQuantity
			}
			if (newStep.waterQuantity !== undefined && newStep.waterQuantity !== null && !isNaN(newStep.waterQuantity)) {
				step.waterQuantity = newStep.waterQuantity
			}
			if (newStep.backsetQuantity !== undefined && newStep.backsetQuantity !== null && !isNaN(newStep.backsetQuantity)) {
				step.backsetQuantity = newStep.backsetQuantity
			}

			// Convert selectedItemId and itemQuantity to recipeBomItems if both are present
			if (newStep.selectedItemId && newStep.itemQuantity !== undefined && newStep.itemQuantity !== null && !isNaN(newStep.itemQuantity)) {
				const selectedItem = items.find((item: ApiItem) => item.id === newStep.selectedItemId)
				if (selectedItem) {
					step.recipeBomItems = [{
						id: `bom_${Date.now()}`,
						item: {
							id: selectedItem.id,
							itemName: selectedItem.itemName,
							itemNumber: selectedItem.itemNumber,
							itemType: selectedItem.itemType || '',
							itemClass: selectedItem.itemClass || '',
							itemGroup: selectedItem.itemGroup || null
						},
						quantity: newStep.itemQuantity,
						displayUnits: {
							id: 'lbs', // Default unit - could be made configurable
							name: 'pounds'
						},
						operation: 'Add'
					}]
				}
			}
			
			// Insert the step at the specified position and reindex
			const newSteps = [...steps]
			newSteps.splice(insertAtIndex, 0, step)
			
			// Reindex all steps to maintain sequential order
			const reindexedSteps = newSteps.map((s, index) => ({
				...s,
				index: index + 1
			}))
			
			onStepsChange(reindexedSteps)
			setNewStep({
				stepType: 'Hold',
				holdType: 'None',
				additiveType: '',
				included: true,
				notes: ''
			})
			setInsertPosition(null)
			setIsAddModalOpen(false)
		}
	}

	const handleEditStep = (step: MashingStep) => {
		console.log('🔍 Editing step:', step)
		console.log('📋 Available items for selection:', items.length, 'items loaded')
		
		setEditingStep(step)
		// Create a clean copy of the step for editing
		const editStep: Partial<MashingStep> = {
			stepType: step.stepType,
			holdType: step.holdType || 'None',
			included: step.included,
			notes: step.notes || '',
			additiveType: step.additiveType || '',
			selectedItemId: step.selectedItemId || ''
		}
		
		// Extract item information from recipeBomItems if available
		if (step.recipeBomItems && step.recipeBomItems.length > 0) {
			const firstBomItem = step.recipeBomItems[0]
			console.log('📦 Found recipeBomItem:', firstBomItem)
			if (firstBomItem) {
				editStep.selectedItemId = firstBomItem.item.id
				editStep.itemQuantity = firstBomItem.quantity
				console.log('✅ Extracted item ID:', firstBomItem.item.id, 'quantity:', firstBomItem.quantity)
				
				// Check if this item ID exists in our items list
				const matchingItem = items.find((item: ApiItem) => item.id === firstBomItem.item.id)
				console.log('🔍 Matching item in dropdown:', matchingItem ? 'Found' : 'NOT FOUND', matchingItem)
			}
		} else {
			console.log('⚠️ No recipeBomItems found for step')
		}
		
		// Only add number fields if they have values
		if (step.heatTempSp !== undefined) editStep.heatTempSp = step.heatTempSp
		if (step.coolTempSp !== undefined) editStep.coolTempSp = step.coolTempSp
		if (step.timeDuration !== undefined) editStep.timeDuration = step.timeDuration
		if (step.waterBacksetSP !== undefined) editStep.waterBacksetSP = step.waterBacksetSP
		// Don't override itemQuantity if we already extracted it from recipeBomItems
		if (step.itemQuantity !== undefined && !editStep.itemQuantity) editStep.itemQuantity = step.itemQuantity
		if (step.waterQuantity !== undefined) editStep.waterQuantity = step.waterQuantity
		if (step.backsetQuantity !== undefined) editStep.backsetQuantity = step.backsetQuantity
		
		console.log('📝 Final editStep data:', editStep)
		setNewStep(editStep)
		setIsAddModalOpen(true)
	}

	const handleUpdateStep = () => {
		if (editingStep && newStep.stepType) {
			const updatedStep = { ...editingStep, ...newStep }
			
			// Convert selectedItemId and itemQuantity to recipeBomItems if both are present
			if (newStep.selectedItemId && newStep.itemQuantity !== undefined && newStep.itemQuantity !== null && !isNaN(newStep.itemQuantity)) {
				const selectedItem = items.find((item: ApiItem) => item.id === newStep.selectedItemId)
				if (selectedItem) {
					updatedStep.recipeBomItems = [{
						id: editingStep.recipeBomItems?.[0]?.id || `bom_${Date.now()}`, // Preserve existing ID if available
						item: {
							id: selectedItem.id,
							itemName: selectedItem.itemName,
							itemNumber: selectedItem.itemNumber,
							itemType: selectedItem.itemType || '',
							itemClass: selectedItem.itemClass || '',
							itemGroup: selectedItem.itemGroup || null
						},
						quantity: newStep.itemQuantity,
						displayUnits: editingStep.recipeBomItems?.[0]?.displayUnits || {
							id: 'lbs', // Default unit - could be made configurable
							name: 'pounds'
						},
						operation: editingStep.recipeBomItems?.[0]?.operation || 'Add'
					}]
				}
			} else if (!newStep.selectedItemId || newStep.itemQuantity === undefined || newStep.itemQuantity === null || isNaN(newStep.itemQuantity)) {
				// Clear recipeBomItems if no item is selected or quantity is invalid
				updatedStep.recipeBomItems = []
			}

			const updatedSteps = steps.map(step =>
				step.id === editingStep.id ? updatedStep : step
			)
			onStepsChange(updatedSteps)
			setEditingStep(null)
			setNewStep({
				stepType: 'Hold',
				holdType: 'None',
				additiveType: '',
				included: true,
				notes: ''
			})
			setIsAddModalOpen(false)
		}
	}

	const handleRemoveStep = (id: string) => {
		const updatedSteps = steps.filter(step => step.id !== id)
		// Reindex remaining steps
		const reindexedSteps = updatedSteps.map((step, index) => ({
			...step,
			index: index + 1
		}))
		onStepsChange(reindexedSteps)
		setStepToDelete(null)
	}

	const handleConfirmRemoveStep = (id: string) => {
		setStepToDelete(id)
	}

	const handleToggleStepIncluded = (id: string, included: boolean) => {
		const updatedSteps = steps.map(step =>
			step.id === id ? { ...step, included } : step
		)
		onStepsChange(updatedSteps)
	}

	const handleMoveStepUp = (stepId: string) => {
		const stepIndex = steps.findIndex(step => step.id === stepId)
		if (stepIndex > 0) {
			const newSteps = [...steps]
			// Swap the steps - ensure both steps exist
			const currentStep = newSteps[stepIndex]
			const previousStep = newSteps[stepIndex - 1]
			
			if (currentStep && previousStep) {
				newSteps[stepIndex] = previousStep
				newSteps[stepIndex - 1] = currentStep
				
				// Update indices to match new positions
				const swappedCurrent = newSteps[stepIndex]
				const swappedPrevious = newSteps[stepIndex - 1]
				if (swappedCurrent && swappedPrevious) {
					swappedCurrent.index = stepIndex + 1
					swappedPrevious.index = stepIndex
				}
				
				onStepsChange(newSteps)
			}
		}
	}

	const handleMoveStepDown = (stepId: string) => {
		const stepIndex = steps.findIndex(step => step.id === stepId)
		if (stepIndex < steps.length - 1 && stepIndex >= 0) {
			const newSteps = [...steps]
			// Swap the steps - ensure both steps exist
			const currentStep = newSteps[stepIndex]
			const nextStep = newSteps[stepIndex + 1]
			
			if (currentStep && nextStep) {
				newSteps[stepIndex] = nextStep
				newSteps[stepIndex + 1] = currentStep
				
				// Update indices to match new positions
				const swappedCurrent = newSteps[stepIndex]
				const swappedNext = newSteps[stepIndex + 1]
				if (swappedCurrent && swappedNext) {
					swappedCurrent.index = stepIndex + 1
					swappedNext.index = stepIndex + 2
				}
				
				onStepsChange(newSteps)
			}
		}
	}

	const handleInsertStepAt = (position: number) => {
		setInsertPosition(position)
		setIsAddModalOpen(true)
	}

	return (
		<div className="h-full flex flex-col space-y-4">
			{isEditing && (
				<div className="flex justify-end items-center flex-shrink-0">
					<Button onClick={() => setIsAddModalOpen(true)} size="sm">
						<Plus className="w-4 h-4 mr-2" />
						Add Step
					</Button>
				</div>
			)}

			{steps.length === 0 ? (
				<Card className="flex-1">
					<CardContent className="p-6 text-center text-muted-foreground h-full flex items-center justify-center">
						No mashing protocol configured. Add steps to create the protocol.
					</CardContent>
				</Card>
			) : (
				<Card className="flex-1 flex flex-col min-h-0">
					<CardContent className="p-0 flex-1 min-h-0">
						<div className="overflow-x-auto overflow-y-auto h-full">
							<table className="w-full min-w-[950px]">
								<thead className="bg-muted sticky top-0 z-10">
									<tr>
										<th className="px-4 py-3 text-left text-sm font-medium">Step</th>
										<th className="px-4 py-3 text-left text-sm font-medium">Type</th>
										<th className="px-4 py-3 text-left text-sm font-medium">Hold Type</th>
										<th className="px-4 py-3 text-left text-sm font-medium">Temp SP</th>
										<th className="px-4 py-3 text-left text-sm font-medium">Time</th>
										<th className="px-4 py-3 text-left text-sm font-medium">Include</th>
										<th className="px-4 py-3 text-left text-sm font-medium">BOM Items</th>
										{isEditing && <th className="px-4 py-3 text-left text-sm font-medium w-60">Actions</th>}
									</tr>
								</thead>
								<tbody>
									{steps.map((step, index) => (
										<tr key={step.id} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/50'}>
											<td className="px-4 py-3 font-medium">{step.index}</td>
											<td className="px-4 py-3">
												<Badge variant="outline">{step.stepType}</Badge>
											</td>
											<td className="px-4 py-3">
												{step.holdType !== 'None' && step.stepType === 'Hold' && (
													<Badge variant={step.holdType === 'Heat' ? 'destructive' : 'default'}>
														{step.holdType}
													</Badge>
												)}
											</td>
											<td className="px-4 py-3">
												{getTemperatureDisplay(step)}
											</td>
											<td className="px-4 py-3">
												{step.timeDuration && `${step.timeDuration} min`}
											</td>
											<td className="px-4 py-3">
												{isEditing ? (
													<Checkbox
														checked={step.included}
														onCheckedChange={(checked: boolean) => handleToggleStepIncluded(step.id, checked)}
													/>
												) : (
													<Badge variant={step.included ? 'default' : 'secondary'}>
														{step.included ? 'Yes' : 'No'}
													</Badge>
												)}
											</td>
											<td className="px-4 py-3">
												{step.recipeBomItems && step.recipeBomItems.length > 0 ? (
													<div className="space-y-1">
														{step.recipeBomItems.map((item) => (
															<div key={item.id} className="text-xs">
																<div className="font-medium text-foreground">
																	{item.item.itemNumber ? `${item.item.itemNumber} - ${item.item.itemName}` : item.item.itemName}
																</div>
																<div className="text-muted-foreground">
																	{item.quantity} {item.displayUnits?.name || 'units'}
																</div>
															</div>
														))}
													</div>
												) : (
													<span className="text-xs text-muted-foreground">No items</span>
												)}
											</td>
											{isEditing && (
												<td className="px-4 py-3 w-60">
													<div className="flex gap-0.5 flex-wrap">
														{/* Insert button */}
														<Button
															variant="outline"
															size="sm"
															onClick={() => handleInsertStepAt(step.index)}
															title={`Insert step before step ${step.index}`}
															className="hover:bg-green-50 hover:border-green-300 px-2"
														>
															<Plus className="w-3 h-3" />
														</Button>
														
														{/* Move buttons group */}
														<div className="flex gap-0 border rounded-md overflow-hidden">
															<Button
																variant="outline"
																size="sm"
																onClick={() => handleMoveStepUp(step.id)}
																disabled={index === 0}
																title="Move step up"
																className="rounded-none border-0 hover:bg-blue-50 disabled:opacity-50 px-1"
															>
																<ChevronUp className="w-3 h-3" />
															</Button>
															<Button
																variant="outline"
																size="sm"
																onClick={() => handleMoveStepDown(step.id)}
																disabled={index === steps.length - 1}
																title="Move step down"
																className="rounded-none border-0 border-l hover:bg-blue-50 disabled:opacity-50 px-1"
															>
																<ChevronDown className="w-3 h-3" />
															</Button>
														</div>
														
														{/* Edit and Delete buttons */}
														<Button
															variant="outline"
															size="sm"
															onClick={() => handleEditStep(step)}
															title="Edit step"
															className="hover:bg-yellow-50 hover:border-yellow-300 px-2"
														>
															Edit
														</Button>
														<Button
															variant="outline"
															size="sm"
															onClick={() => handleConfirmRemoveStep(step.id)}
															title="Remove step"
															className="hover:bg-red-50 hover:border-red-300 px-2"
														>
															<Trash2 className="w-3 h-3" />
														</Button>
													</div>
												</td>
											)}
										</tr>
									))}
									{/* Add row for inserting at the end */}
									{isEditing && steps.length > 0 && (
										<tr className="bg-muted/30 border-t-2 border-dashed border-muted-foreground/30">
											<td className="px-4 py-3 font-medium text-muted-foreground">{steps.length + 1}</td>
											<td className="px-4 py-3 text-muted-foreground" colSpan={5}>
												<em>Insert new step here</em>
											</td>
											<td className="px-4 py-3 w-60">
												<Button
													variant="outline"
													size="sm"
													onClick={() => handleInsertStepAt(steps.length + 1)}
													title="Add step at end"
												>
													<Plus className="w-3 h-3 mr-1" />
													Add Step
												</Button>
											</td>
										</tr>
									)}
								</tbody>
							</table>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Add/Edit Step Modal */}
			<FormModal
				key={editingStep ? `edit-${editingStep.id}` : 'add-new'}
				isOpen={isAddModalOpen}
				onClose={() => {
					setIsAddModalOpen(false)
					setEditingStep(null)
					setNewStep({
						stepType: 'Hold',
						holdType: 'None',
						additiveType: '',
						included: true,
						notes: ''
					})
					setInsertPosition(null)
				}}
				title={editingStep ? 'Edit Mashing Step' : 'Add Mashing Step'}
				description="Configure mashing protocol step parameters"
				size="2xl"
				footer={
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
							Cancel
						</Button>
						<Button onClick={editingStep ? handleUpdateStep : handleAddStep}>
							{editingStep ? 'Update' : 'Add'} Step
						</Button>
					</div>
				}
			>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{/* Insert Position field - only show when adding new step */}
					{!editingStep && (
						<div className="space-y-2 md:col-span-2">
							<Label htmlFor="insertPosition">Insert Position (optional)</Label>
							<div className="flex items-center gap-2">
								<Input
									id="insertPosition"
									type="number"
									value={insertPosition || ''}
									onChange={(e) => {
										const value = e.target.value
										setInsertPosition(value ? parseInt(value) : null)
									}}
									placeholder={`Leave empty to add at end (step ${steps.length + 1})`}
									min="1"
									max={steps.length + 1}
									className="flex-1"
								/>
								<span className="text-sm text-muted-foreground">
									of {steps.length + 1}
								</span>
							</div>
							<p className="text-xs text-muted-foreground">
								Specify the step number where you want to insert this step. Existing steps will be renumbered automatically.
							</p>
						</div>
					)}

					<div className="space-y-2">
						<Label htmlFor="stepType">Step Type</Label>
						<Select
							value={newStep.stepType || 'Hold'}
							onValueChange={(value) => setNewStep({ ...newStep, stepType: value as MashingStep['stepType'] })}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select step type" />
							</SelectTrigger>
							<SelectContent>
								{stepTypes.map((type) => (
									<SelectItem key={type.value} value={type.value}>
										{type.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Only show Hold Type field when step type is "Hold" */}
					{newStep.stepType === 'Hold' && (
						<div className="space-y-2">
							<Label htmlFor="holdType">Hold Type</Label>
							<Select
								value={newStep.holdType || 'None'}
								onValueChange={(value) => {
								const typedValue = value as 'Heat' | 'Cool' | 'None'
								setNewStep({ ...newStep, holdType: typedValue })
							}}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select hold type" />
								</SelectTrigger>
								<SelectContent>
									{holdTypes.map((type) => (
										<SelectItem key={type.value} value={type.value}>
											{type.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					{/* Item Selection for grain/additive types */}
					{requiresItemSelection(newStep.stepType || '') && (
						<>
							<div className="space-y-2">
								<Label htmlFor="selectedItem">Select Item</Label>
								<Select
									value={newStep.selectedItemId || ''}
									onValueChange={(value) => setNewStep({ ...newStep, selectedItemId: value })}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select item" />
									</SelectTrigger>
									<SelectContent>
										{itemsLoading ? (
											<SelectItem value="" disabled>Loading items...</SelectItem>
										) : items.length === 0 ? (
											<SelectItem value="" disabled>No items available</SelectItem>
										) : getFilteredItems(newStep.stepType || '').length === 0 ? (
											<SelectItem value="" disabled>
												No items available for {newStep.stepType} step type
											</SelectItem>
										) : (
											getFilteredItems(newStep.stepType || '').map((item: ApiItem) => (
												<SelectItem key={item.id} value={item.id}>
													{item.itemName} ({item.itemNumber})
													{item.itemGroup && (
														<span className="text-xs text-muted-foreground ml-2">
															[{item.itemGroup}]
														</span>
													)}
												</SelectItem>
											))
										)}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<Label htmlFor="itemQuantity">Item Quantity</Label>
								<Input
									id="itemQuantity"
									type="number"
									value={newStep.itemQuantity || ''}
									onChange={(e) => {
										const value = e.target.value
										updateNumberField('itemQuantity', value)
									}}
									placeholder="Enter quantity"
									min="0"
									step="0.01"
								/>
							</div>
						</>
					)}

					{/* Liquid Add quantities */}
					{newStep.stepType === 'LiquidAdd' && (
						<>
							<div className="space-y-2">
								<Label htmlFor="waterQuantity">Water Quantity</Label>
								<Input
									id="waterQuantity"
									type="number"
									value={newStep.waterQuantity || ''}
									onChange={(e) => {
										const value = e.target.value
										updateNumberField('waterQuantity', value)
									}}
									placeholder="Enter water quantity"
									min="0"
									step="0.1"
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="backsetQuantity">Backset Quantity</Label>
								<Input
									id="backsetQuantity"
									type="number"
									value={newStep.backsetQuantity || ''}
									onChange={(e) => {
										const value = e.target.value
										updateNumberField('backsetQuantity', value)
									}}
									placeholder="Enter backset quantity"
									min="0"
									step="0.1"
								/>
							</div>
						</>
					)}

					{(newStep.stepType === 'Hold' || newStep.stepType === 'LiquidAdd') && (
						<>
							{newStep.holdType === 'Heat' && (
								<div className="space-y-2">
									<Label htmlFor="heatTempSp">Heat Temp SP (°F)</Label>
									<Input
										id="heatTempSp"
										type="number"
										value={newStep.heatTempSp || ''}
										onChange={(e) => {
											const value = e.target.value
											updateNumberField('heatTempSp', value)
										}}
										placeholder="180"
										min="0"
										max="300"
									/>
								</div>
							)}

							{newStep.holdType === 'Cool' && (
								<div className="space-y-2">
									<Label htmlFor="coolTempSp">Cool Temp SP (°F)</Label>
									<Input
										id="coolTempSp"
										type="number"
										value={newStep.coolTempSp || ''}
										onChange={(e) => {
											const value = e.target.value
											updateNumberField('coolTempSp', value)
										}}
										placeholder="150"
										min="0"
										max="300"
									/>
								</div>
							)}

							{/* Only show general temperature field for Hold steps with 'None' holdType */}
							{(newStep.stepType === 'Hold' && newStep.holdType === 'None') && (
								<div className="space-y-2">
									<Label htmlFor="tempSp">Temperature SP (°F)</Label>
									<Input
										id="tempSp"
										type="number"
										value={newStep.heatTempSp || newStep.coolTempSp || ''}
										onChange={(e) => {
											const value = e.target.value
											updateNumberField('heatTempSp', value)
										}}
										placeholder="180"
										min="0"
										max="300"
									/>
								</div>
							)}

							<div className="space-y-2">
								<Label htmlFor="timeDuration">Time Duration (minutes)</Label>
								<Input
									id="timeDuration"
									type="number"
									value={newStep.timeDuration || ''}
									onChange={(e) => {
										const value = e.target.value
										updateNumberField('timeDuration', value)
									}}
									placeholder="60"
									min="0"
								/>
							</div>
						</>
					)}

					{newStep.stepType === 'LiquidAdd' && (
						<div className="space-y-2">
							<Label htmlFor="waterBacksetSP">Water/Backset SP</Label>
							<Input
								id="waterBacksetSP"
								type="number"
								value={newStep.waterBacksetSP || ''}
								onChange={(e) => {
									const value = e.target.value
									updateNumberField('waterBacksetSP', value)
								}}
								placeholder="1000"
								min="0"
								step="0.1"
							/>
						</div>
					)}

					{newStep.stepType === 'AdditiveAdd' && (
						<div className="space-y-2">
							<Label htmlFor="additiveType">Additive Type</Label>
							<Select
								value={newStep.additiveType || ''}
								onValueChange={(value) => setNewStep({ ...newStep, additiveType: value })}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select additive" />
								</SelectTrigger>
								<SelectContent>
									{additiveTypes.map((additive) => (
										<SelectItem key={additive} value={additive}>
											{additive}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					<div className="space-y-2 md:col-span-2">
						<Label htmlFor="notes">Additional Notes</Label>
						<Input
							id="notes"
							value={newStep.notes || ''}
							onChange={(e) => setNewStep({ ...newStep, notes: e.target.value })}
							placeholder="Optional notes for this step"
						/>
					</div>

					<div className="flex items-center space-x-2 md:col-span-2">
						<Checkbox
							id="included"
							checked={newStep.included ?? true}
							onCheckedChange={(checked: boolean) => setNewStep({ ...newStep, included: checked })}
						/>
						<Label htmlFor="included">Include this step in the protocol</Label>
					</div>
				</div>
			</FormModal>

			{/* Confirmation Dialog for Step Removal */}
			<FormModal
				isOpen={stepToDelete !== null}
				onClose={() => setStepToDelete(null)}
				title="Confirm Step Removal"
				description="Are you sure you want to remove this step? This action cannot be undone."
				size="sm"
				footer={
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => setStepToDelete(null)}>
							Cancel
						</Button>
						<Button 
							variant="destructive" 
							onClick={() => stepToDelete && handleRemoveStep(stepToDelete)}
						>
							Remove Step
						</Button>
					</div>
				}
			>
				<div className="text-center py-4">
					<p className="text-muted-foreground">
						{stepToDelete && (
							<>
								Step {steps.find(s => s.id === stepToDelete)?.index}: {steps.find(s => s.id === stepToDelete)?.stepType}
							</>
						)}
					</p>
				</div>
			</FormModal>
		</div>
	)
}

// Complete Recipe Management Component
export function RecipeManagement({
	recipe,
	onRecipeChange,
	isEditing = false
}: {
	recipe: Recipe
	onRecipeChange: (recipe: Recipe) => void
	isEditing?: boolean
}) {
	const handleIngredientsChange = (ingredients: RecipeIngredient[]) => {
		onRecipeChange({ ...recipe, ingredients })
	}

	const handleParametersChange = (parameters: RecipeParameter[]) => {
		onRecipeChange({ ...recipe, parameters })
	}

	const handleStepsChange = (mashingSteps: MashingStep[]) => {
		onRecipeChange({ ...recipe, mashingSteps })
	}

	return (
		<div className="space-y-6">
			{/* Recipe Header */}
			<Card>
				<CardHeader>
					<div className="flex justify-between items-start">
						<div>
							<CardTitle className="flex items-center gap-2">
								{recipe.name}
								<Badge variant={recipe.active ? 'default' : 'secondary'}>
									{recipe.active ? 'Active' : 'Inactive'}
								</Badge>
							</CardTitle>
							<CardDescription>
								{recipe.whiskeyType} • {recipe.customer} • Revision {recipe.revision}
							</CardDescription>
						</div>
						<div className="text-right text-sm text-muted-foreground">
							Created on {recipe.createdAt.toLocaleDateString()} by {recipe.createdBy}
						</div>
					</div>
				</CardHeader>
			</Card>

			{/* Recipe Tabs */}
			<Tabs defaultValue="bom" className="w-full">
				<TabsList className="grid w-full grid-cols-3">
					<TabsTrigger value="bom">Bill of Materials</TabsTrigger>
					<TabsTrigger value="parameters">Parameters</TabsTrigger>
					<TabsTrigger value="mashing">Mashing Protocol</TabsTrigger>
				</TabsList>

				<TabsContent value="bom" className="space-y-4">
					<RecipeBOMEditor
						ingredients={recipe.ingredients}
						onIngredientsChange={handleIngredientsChange}
						isEditing={isEditing}
						recipeId={recipe.id}
						{...(recipe.mashingProtocolTemplate && {
							mashBill: recipe.mashingProtocolTemplate
						})}
					/>
				</TabsContent>

				<TabsContent value="parameters" className="space-y-4">
					<RecipeParametersEditor
						parameters={recipe.parameters}
						onParametersChange={handleParametersChange}
						isEditing={isEditing}
					/>
				</TabsContent>

				<TabsContent value="mashing" className="space-y-4">
					<MashingProtocolEditor
						steps={recipe.mashingSteps}
						onStepsChange={handleStepsChange}
						isEditing={isEditing}
					/>
				</TabsContent>
			</Tabs>
		</div>
	)
} 