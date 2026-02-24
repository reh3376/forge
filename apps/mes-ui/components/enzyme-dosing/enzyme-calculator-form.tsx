'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Separator } from '@/components/ui/separator'
import { Calculator, Loader2, RotateCcw, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { 
  useEnzymeDosingCalculation, 
  useRecipeBoms, 
  useRecipesForEnzymeDosing,
  type EnzymeCalculation,
  type Recipe
} from '@/lib/hooks/use-enzyme-dosing'

// Enhanced type for recipe data used in the component
interface EnzymeRecipeData {
  id: string;
  name?: string | undefined;
  description?: string | undefined;
  mashBill?: string | undefined;
  grainLoadLbs?: number | undefined;
}

// Validation schema
const calculationSchema = z.object({
  recipeId: z.string().optional(),
  mashBill: z.string().min(1, 'Mash bill is required'),
  grainLoadLbs: z.number()
    .min(1000, 'Grain load must be at least 1,000 lbs')
    .max(50000, 'Grain load cannot exceed 50,000 lbs'),
  enzymeId: z.string().min(1, 'Enzyme is required').optional(),
  batchSize: z.number()
    .min(1000, 'Batch size must be at least 1,000')
    .max(50000, 'Batch size cannot exceed 50,000')
    .optional(),
  targetActivity: z.number()
    .min(0.1, 'Target activity must be at least 0.1')
    .max(1000, 'Target activity cannot exceed 1,000')
    .optional(),
  temperature: z.number()
    .min(0, 'Temperature must be at least 0°C')
    .max(100, 'Temperature cannot exceed 100°C')
    .optional(),
  pH: z.number()
    .min(0, 'pH must be at least 0')
    .max(14, 'pH cannot exceed 14')
    .optional(),
  notes: z.string().optional()
})

type CalculationFormData = z.infer<typeof calculationSchema>

interface EnzymeCalculatorFormProps {
  onCalculationComplete: (results: EnzymeCalculation) => void
}

export function EnzymeCalculatorForm({ onCalculationComplete }: EnzymeCalculatorFormProps) {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('')
  const [processedRecipe, setProcessedRecipe] = useState<EnzymeRecipeData | null>(null)
  
  // API hooks
  const enzymeDosing = useEnzymeDosingCalculation()
  const { isLoading: recipesLoading, refetch: refetchRecipes } = useRecipeBoms()
  const { data: recipes } = useRecipesForEnzymeDosing()

  const form = useForm<CalculationFormData>({
    resolver: zodResolver(calculationSchema),
    defaultValues: {
      recipeId: '',
      mashBill: '',
      grainLoadLbs: 5000,
      enzymeId: '',
      batchSize: 5000,
      targetActivity: 1.0
    }
  })

  // Process selected recipe data when recipeId changes
  useEffect(() => {
    if (!selectedRecipeId || !recipes) {
      setProcessedRecipe(null);
      return;
    }

    // Find the selected recipe
    const recipe = recipes.find((r: Recipe) => r.id === selectedRecipeId);
    if (!recipe) {
      setProcessedRecipe(null);
      return;
    }

    // Extract relevant data
    const mashBill = getMashBillFromRecipe(recipe);
    const grainLoad = getGrainLoadFromRecipe(recipe);
    
    // Create processed recipe object
    const processedData: EnzymeRecipeData = {
      id: recipe.id,
      name: recipe.Recipe,
      description: recipe.mashingProtocol?.templateDescription,
      mashBill,
      grainLoadLbs: grainLoad
    };
    
    setProcessedRecipe(processedData);
    
    // Update form values
    if (mashBill) form.setValue('mashBill', mashBill);
    if (grainLoad) form.setValue('grainLoadLbs', grainLoad);
    form.setValue('recipeId', recipe.id);
    
  }, [selectedRecipeId, recipes, form]);

  // Helper functions to extract recipe data
  const getMashBillFromRecipe = (recipe: Recipe): string => {
    // Extract mashbill from recipe parameters or other source
    // This is a placeholder - implement actual logic based on your data structure
    const mashBillParam = recipe.parameters?.find(p => 
      p.recipeParamName?.toLowerCase().includes('mash') && 
      p.recipeParamName?.toLowerCase().includes('bill')
    );
    
    if (mashBillParam?.recipeSetpointType === 'STRING') {
      return String(mashBillParam.recipeNumericalSetpoint || '70-20-00-10');
    }
    
    // Default mashbill if not found
    return '70-20-00-10';
  };
  
  const getGrainLoadFromRecipe = (recipe: Recipe): number => {
    // Extract grain load from recipe parameters or other source
    // This is a placeholder - implement actual logic based on your data structure
    const grainLoadParam = recipe.parameters?.find(p => 
      p.recipeParamName?.toLowerCase().includes('grain') && 
      p.recipeParamName?.toLowerCase().includes('load')
    );
    
    if (grainLoadParam?.recipeSetpointType === 'NUMERIC') {
      return Number(grainLoadParam.recipeNumericalSetpoint || 5000);
    }
    
    // Default grain load if not found
    return 5000;
  };

  const onSubmit = async (data: CalculationFormData) => {
    try {
      // Prepare data for API call
      const calculationInput = {
        recipeId: data.recipeId || '',
        enzymeId: data.enzymeId || '',
        batchSize: data.batchSize || 5000,
        targetActivity: data.targetActivity || 1.0,
        // Make sure optional fields are not passed as undefined
        ...(data.temperature !== undefined && { temperature: data.temperature }),
        ...(data.pH !== undefined && { pH: data.pH }),
        ...(data.notes && { notes: data.notes }),
        // Custom fields not in the API schema
        mashBill: data.mashBill,
        grainLoadLbs: data.grainLoadLbs
      };
      
      // Submit calculation request
      const result = await enzymeDosing.mutateAsync(calculationInput);
      onCalculationComplete(result);
    } catch (error) {
      console.error('Calculation failed:', error);
      toast.error('Calculation failed', { 
        description: 'There was an error processing your request' 
      });
    }
  }

  const handleReset = () => {
    form.reset()
    setSelectedRecipeId('')
    setProcessedRecipe(null)
  }

  const handleRecipeSelect = (recipeId: string) => {
    if (recipeId === 'none') {
      setSelectedRecipeId('')
      setProcessedRecipe(null)
      return
    }
    setSelectedRecipeId(recipeId)
  }

  const handleRefreshRecipes = () => {
    refetchRecipes()
    toast.success('Recipes Refreshed', {
      description: 'Recipe list has been updated'
    })
  }

  return (
    <div className="space-y-6">
      {/* Recipe Selection */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Recipe Selection (Optional)</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefreshRecipes}
            disabled={recipesLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${recipesLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        
        <Select value={selectedRecipeId} onValueChange={handleRecipeSelect}>
          <SelectTrigger>
            <SelectValue placeholder={recipesLoading ? "Loading recipes..." : "Select a recipe to auto-populate fields"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Manual Entry</SelectItem>
            {recipes?.map((recipe: Recipe) => (
              <SelectItem key={recipe.id} value={recipe.id}>
                {recipe.Recipe || 'Unnamed Recipe'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {processedRecipe && (
          <div className="p-3 bg-muted rounded-lg text-sm">
            <div className="font-medium">{processedRecipe.name || 'Selected Recipe'}</div>
            <div className="text-muted-foreground">
              Mash Bill: {processedRecipe.mashBill || 'N/A'} | Grain Load: {processedRecipe.grainLoadLbs ? processedRecipe.grainLoadLbs.toLocaleString() : 'N/A'} lbs
            </div>
            {processedRecipe.description && (
              <div className="text-muted-foreground mt-1">{processedRecipe.description}</div>
            )}
          </div>
        )}
      </div>

      <Separator />

      {/* Calculation Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Calculation Parameters</h3>
            
            {/* Mash Bill Input */}
            <FormField
              control={form.control}
              name="mashBill"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mash Bill</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="70-21-00-09"
                      {...field}
                      className="font-mono"
                    />
                  </FormControl>
                  <FormDescription>
                    Enter percentages as XX-XX-XX-XX (corn-rye-wheat-malt). Must sum to 100%.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Grain Load Input */}
            <FormField
              control={form.control}
              name="grainLoadLbs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Grain Load (lbs)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1000"
                      max="50000"
                      step="0.01"
                      placeholder="5000"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormDescription>
                    Enter total grain weight in pounds (1,000 - 50,000 lbs)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={enzymeDosing.isPending}
              className="flex-1"
            >
              {enzymeDosing.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <Calculator className="mr-2 h-4 w-4" />
                  Calculate Dosing
                </>
              )}
            </Button>
            
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={enzymeDosing.isPending}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
          </div>
        </form>
      </Form>

      {/* Calculation Status */}
      {enzymeDosing.isPending && (
        <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-medium">Calculating enzyme dosing amounts...</span>
          </div>
          <div className="text-sm text-blue-600 dark:text-blue-400 mt-1">
            This may take a few seconds to complete.
          </div>
        </div>
      )}
    </div>
  )
} 