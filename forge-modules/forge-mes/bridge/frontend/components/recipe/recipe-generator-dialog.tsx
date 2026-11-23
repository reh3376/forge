'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Sparkles } from 'lucide-react';
import { useGenerateRecipe, type GenerateRecipeInput, type GeneratedRecipe } from '@/hooks/use-generate-recipe';
import { toast } from 'sonner';

const generateRecipeSchema = z.object({
  recipeName: z.string().min(1, 'Recipe name is required'),
  customerId: z.string().min(1, 'Customer is required'),
  whiskeyType: z.string().optional(),
  description: z.string().optional(),
  targetVolume: z.number().positive().optional(),
  alcoholContent: z.number().min(0).max(100).optional(),
  mashingRequirements: z.string().optional(),
  fermentationNotes: z.string().optional(),
  distillationSpecs: z.string().optional(),
  agingRequirements: z.string().optional(),
  qualityStandards: z.string().optional(),
});

type GenerateRecipeFormData = z.infer<typeof generateRecipeSchema>;

interface RecipeGeneratorDialogProps {
  trigger?: React.ReactNode;
  onRecipeGenerated?: (recipe: GeneratedRecipe) => void;
  customers?: Array<{ id: string; name: string }>;
  currentUser?: string;
}

const whiskeyTypes = [
  'FourGrainBourbon',
  'FourGrainWhiskey',
  'MaltWhiskey',
  'RyeBourbon',
  'RyeWhiskey',
  'WheatWhiskey',
  'WheatedBourbon',
];

export function RecipeGeneratorDialog({
  trigger,
  onRecipeGenerated,
  customers = [],
  currentUser = 'system',
}: RecipeGeneratorDialogProps) {
  const [open, setOpen] = useState(false);
  const { generateRecipe, loading, error } = useGenerateRecipe();

  const form = useForm<GenerateRecipeFormData>({
    resolver: zodResolver(generateRecipeSchema),
    defaultValues: {
      recipeName: '',
      customerId: '',
      whiskeyType: '',
      description: '',
      targetVolume: undefined,
      alcoholContent: undefined,
      mashingRequirements: '',
      fermentationNotes: '',
      distillationSpecs: '',
      agingRequirements: '',
      qualityStandards: '',
    },
  });

  const onSubmit = async (data: GenerateRecipeFormData) => {
    try {
      const input: GenerateRecipeInput = {
        recipeName: data.recipeName,
        customerId: data.customerId,
        createdBy: currentUser,
        ...(data.whiskeyType && { whiskeyType: data.whiskeyType }),
        ...(data.description && { description: data.description }),
        ...(data.targetVolume && { targetVolume: data.targetVolume }),
        ...(data.alcoholContent && { alcoholContent: data.alcoholContent }),
        ...(data.mashingRequirements && { mashingRequirements: data.mashingRequirements }),
        ...(data.fermentationNotes && { fermentationNotes: data.fermentationNotes }),
        ...(data.distillationSpecs && { distillationSpecs: data.distillationSpecs }),
        ...(data.agingRequirements && { agingRequirements: data.agingRequirements }),
        ...(data.qualityStandards && { qualityStandards: data.qualityStandards }),
      };

      const generatedRecipe = await generateRecipe(input);
      
      if (generatedRecipe) {
        toast.success('Recipe Generated Successfully', {
          description: `Generated recipe "${generatedRecipe.recipeName}" with AI assistance.`,
        });
        
        onRecipeGenerated?.(generatedRecipe);
        setOpen(false);
        form.reset();
      }
    } catch (err) {
      console.error('Error generating recipe:', err);
      toast.error('Generation Failed', {
        description: 'Failed to generate recipe. Please try again.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Generate Recipe with AI
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate Recipe with AI
          </DialogTitle>
          <DialogDescription>
            Provide details about your desired recipe and let AI generate a comprehensive recipe with parameters, BOM, and mashing protocol.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="recipeName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recipe Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Premium Bourbon Recipe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="whiskeyType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Whiskey Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select whiskey type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {whiskeyTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type.replace(/([A-Z])/g, ' $1').trim()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="targetVolume"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Volume (L)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 1000"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="alcoholContent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Alcohol Content (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 40"
                        min="0"
                        max="100"
                        step="0.1"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the desired characteristics, flavor profile, or special requirements..."
                      className="min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Provide details about the desired flavor profile, characteristics, or special requirements.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="mashingRequirements"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mashing Requirements</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Specific mashing temperature, time, or process requirements..."
                        className="min-h-[60px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fermentationNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fermentation Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Yeast type, fermentation temperature, duration..."
                        className="min-h-[60px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="distillationSpecs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Distillation Specifications</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Number of distillations, proof requirements, cuts..."
                        className="min-h-[60px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="agingRequirements"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Aging Requirements</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Barrel type, aging duration, warehouse conditions..."
                        className="min-h-[60px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="qualityStandards"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quality Standards</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Specific quality requirements, testing protocols, compliance standards..."
                      className="min-h-[60px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                Error: {error.message}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="gap-2">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Recipe
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 