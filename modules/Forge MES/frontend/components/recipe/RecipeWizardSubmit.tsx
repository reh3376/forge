'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useMasterRecipe } from '@/hooks/useMasterRecipe';
import { WizardData } from '@/lib/api/graphql/master-recipe-mutations';

interface RecipeWizardSubmitProps {
  wizardData: WizardData;
  isEditing?: boolean;
  existingRecipeId?: string;
  onSuccess?: (recipeId: string) => void;
  onCancel?: () => void;
}

export const RecipeWizardSubmit: React.FC<RecipeWizardSubmitProps> = ({
  wizardData,
  isEditing = false,
  existingRecipeId,
  onSuccess,
  onCancel,
}) => {
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const {
    createRecipeFromWizard,
    updateRecipeFromWizard,
    validateRecipeData,
    generateRecipeCodeFromData,
    loading,
    error,
    lastCreatedRecipe,
  } = useMasterRecipe();

  // Validate the wizard data
  const validation = validateRecipeData(wizardData);
  const generatedCode = generateRecipeCodeFromData(wizardData);

  const handleSubmit = async () => {
    setSubmitAttempted(true);

    if (!validation.isValid) {
      return;
    }

    try {
      let result;
      
      if (isEditing && existingRecipeId) {
        result = await updateRecipeFromWizard(existingRecipeId, wizardData);
      } else {
        result = await createRecipeFromWizard(wizardData);
      }

      if (result && onSuccess) {
        onSuccess(result.id);
      }
    } catch (err) {
      console.error('Error submitting recipe:', err);
    }
  };

  const getSubmitButtonText = () => {
    if (loading) {
      return isEditing ? 'Updating Recipe...' : 'Creating Recipe...';
    }
    return isEditing ? 'Update Recipe' : 'Create Recipe';
  };

  const getSubmitButtonIcon = () => {
    if (loading) {
      return <Loader2 className="mr-2 h-4 w-4 animate-spin" />;
    }
    return <CheckCircle className="mr-2 h-4 w-4" />;
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center">
          🍺 {isEditing ? 'Update' : 'Create'} Master Recipe
        </CardTitle>
        <CardDescription>
          {isEditing 
            ? 'Review and update your master recipe configuration'
            : 'Review and submit your new master recipe configuration'
          }
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Recipe Summary */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="font-semibold mb-2">Recipe Summary</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Recipe Name:</span>
              <p>{wizardData.recipeName || generatedCode}</p>
            </div>
            <div>
              <span className="font-medium">Whiskey Type:</span>
              <p>{wizardData.whiskeyType || 'FourGrainBourbon'}</p>
            </div>
            <div>
              <span className="font-medium">Cooks per Fermentation:</span>
              <p>{wizardData.cooksPerFerm || 2.5}</p>
            </div>
            <div>
              <span className="font-medium">Customer Code:</span>
              <p>{wizardData.customerCode || generatedCode.split('-')[0]}</p>
            </div>
          </div>
        </div>

        {/* Mash Bill */}
        {wizardData.mashBill && (
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Mash Bill Composition</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Corn: {wizardData.mashBill.corn}%</div>
              <div>Wheat: {wizardData.mashBill.wheat}%</div>
              <div>Malted Barley: {wizardData.mashBill.maltedBarley}%</div>
              <div>Rye: {wizardData.mashBill.rye}%</div>
            </div>
          </div>
        )}

        {/* Ingredients Count */}
        {wizardData.ingredients && wizardData.ingredients.length > 0 && (
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Ingredients</h3>
            <p className="text-sm">{wizardData.ingredients.length} ingredients configured</p>
          </div>
        )}

        {/* Mashing Steps Count */}
        {wizardData.mashingSteps && wizardData.mashingSteps.length > 0 && (
          <div className="bg-yellow-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Mashing Protocol</h3>
            <p className="text-sm">{wizardData.mashingSteps.length} mashing steps configured</p>
          </div>
        )}

        {/* Validation Errors */}
        {submitAttempted && !validation.isValid && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-medium mb-2">Please fix the following issues:</div>
              <ul className="list-disc list-inside space-y-1">
                {validation.errors.map((error, index) => (
                  <li key={index} className="text-sm">{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Submission Error */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-medium">Submission Error</div>
              <p className="text-sm mt-1">{error}</p>
            </AlertDescription>
          </Alert>
        )}

        {/* Success Message */}
        {lastCreatedRecipe && !isEditing && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-medium">Recipe Created Successfully!</div>
              <p className="text-sm mt-1">
                Recipe ID: {lastCreatedRecipe.id}
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex justify-between pt-4">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          
          <Button
            onClick={handleSubmit}
            disabled={loading || (submitAttempted && !validation.isValid)}
            className="min-w-[150px]"
          >
            {getSubmitButtonIcon()}
            {getSubmitButtonText()}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default RecipeWizardSubmit; 