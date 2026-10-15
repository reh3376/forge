import { useMutation } from '@apollo/client';
import { toast } from 'sonner';
import { useCurrentUserEmail } from '@/lib/utils/user-context';
import {
  UPDATE_PRODUCTION_ORDER,
  UPDATE_SCHEDULE_ORDER,
  CREATE_PRODUCTION_ORDER_RECIPE_INSTANCE,
  ProductionOrderUpdateData,
  ScheduleOrderUpdateData,
  validateProductionOrderUpdate,
  validateScheduleOrderUpdate,
  formatDateForGraphQL
} from '../production-order-mutations';

interface UseOrderMutationsReturn {
  updateProductionOrder: (id: string, data: ProductionOrderUpdateData) => Promise<boolean>;
  updateScheduleOrder: (id: string, data: ScheduleOrderUpdateData) => Promise<boolean>;
  createProductionOrderRecipeInstance: (scheduleOrderQueueId: string) => Promise<boolean>;
  isUpdatingProductionOrder: boolean;
  isUpdatingScheduleOrder: boolean;
  isCreatingRecipeInstance: boolean;
}

export const useOrderMutations = (): UseOrderMutationsReturn => {
  const [updateProductionOrderMutation, { loading: isUpdatingProductionOrder }] = useMutation(UPDATE_PRODUCTION_ORDER);
  const [updateScheduleOrderMutation, { loading: isUpdatingScheduleOrder }] = useMutation(UPDATE_SCHEDULE_ORDER);
  const [createRecipeInstanceMutation, { loading: isCreatingRecipeInstance }] = useMutation(CREATE_PRODUCTION_ORDER_RECIPE_INSTANCE);

  // Get current user email for audit trails
  const userEmail = useCurrentUserEmail();

  const updateProductionOrder = async (id: string, data: ProductionOrderUpdateData): Promise<boolean> => {
    try {
      // Validate the data
      const validationErrors = validateProductionOrderUpdate(data);
      if (validationErrors.length > 0) {
        toast.error('Validation Error', {
          description: validationErrors.join(', ')
        });
        return false;
      }

      // Format dates if present
      const formattedData = { ...data };
      if (formattedData.startDate) {
        formattedData.startDate = formatDateForGraphQL(formattedData.startDate);
      }
      if (formattedData.endDate) {
        formattedData.endDate = formatDateForGraphQL(formattedData.endDate);
      }

      // Add updatedBy with user email from Entra ID
      formattedData.updatedBy = userEmail;

      const result = await updateProductionOrderMutation({
        variables: {
          where: { id },
          data: formattedData
        }
      });

      if (result.data?.updateProductionOrder) {
        toast.success('Production Order Updated', {
          description: `Production order ${id} has been successfully updated.`
        });
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error updating production order:', error);
      toast.error('Update Failed', {
        description: error instanceof Error ? error.message : 'Failed to update production order'
      });
      return false;
    }
  };

  const updateScheduleOrder = async (id: string, data: ScheduleOrderUpdateData): Promise<boolean> => {
    try {
      console.log('Updating schedule order:', { id, data });
      
      // Validate the data
      const validationErrors = validateScheduleOrderUpdate(data);
      if (validationErrors.length > 0) {
        console.error('Validation errors:', validationErrors);
        toast.error('Validation Error', {
          description: validationErrors.join(', ')
        });
        return false;
      }

      // Format dates if present
      const formattedData = { ...data };
      const dateFields = [
        'estimatedStart', 'estimatedEnd', 'actualStart', 'actualEnd',
        'estimatedMashingStartTime', 'estimatedFermentationStartTime',
        'estimatedDistillationStartTime', 'estimatedBarrelingStartTime',
        'estimatedProcessingStartTime'
      ] as const;

      dateFields.forEach(field => {
        if (formattedData[field]) {
          formattedData[field] = formatDateForGraphQL(formattedData[field] as string);
        }
      });

      // Add updatedBy with user email from Entra ID
      formattedData.updatedBy = userEmail;

      console.log('Formatted data for mutation:', formattedData);

      const result = await updateScheduleOrderMutation({
        variables: {
          where: { id },
          data: formattedData
        }
      });

      console.log('Mutation result:', result);

      if (result.data?.updateScheduleOrder) {
        console.log('Schedule order updated successfully:', result.data.updateScheduleOrder);
        toast.success('Schedule Order Updated', {
          description: `Schedule order ${id} has been successfully updated.`
        });
        return true;
      } else {
        console.warn('Mutation completed but no data returned');
        toast.warning('Update Status Unknown', {
          description: 'The update request completed but the result is unclear.'
        });
        return false;
      }

      return false;
    } catch (error) {
      console.error('Error updating schedule order:', error);
      
      // Enhanced error logging
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      
      // Check for GraphQL errors
      if (error && typeof error === 'object' && 'graphQLErrors' in error) {
        console.error('GraphQL errors:', (error as { graphQLErrors: unknown }).graphQLErrors);
      }
      
      if (error && typeof error === 'object' && 'networkError' in error) {
        console.error('Network error:', (error as { networkError: unknown }).networkError);
      }

      toast.error('Update Failed', {
        description: error instanceof Error ? error.message : 'Failed to update schedule order'
      });
      return false;
    }
  };

  const createProductionOrderRecipeInstance = async (
    scheduleOrderQueueId: string
  ): Promise<boolean> => {
    try {
      const result = await createRecipeInstanceMutation({
        variables: {
          scheduleOrderQueueId,
          createdBy: userEmail // Use logged-in user's email from Entra ID
        }
      });

      if (result.data?.createProductionOrderRecipeInstanceFromScheduleQueue) {
        toast.success('Recipe Instance Created', {
          description: 'Production order recipe instance has been successfully created.'
        });
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error creating production order recipe instance:', error);
      toast.error('Creation Failed', {
        description: error instanceof Error ? error.message : 'Failed to create recipe instance'
      });
      return false;
    }
  };

  return {
    updateProductionOrder,
    updateScheduleOrder,
    createProductionOrderRecipeInstance,
    isUpdatingProductionOrder,
    isUpdatingScheduleOrder,
    isCreatingRecipeInstance
  };
}; 