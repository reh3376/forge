import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EditIcon } from 'lucide-react';
import { EditOrderPopup } from '@/components/schedule/EditOrderPopup';
import { useOrderMutations } from '@/hooks/useOrderMutations';

// Example of how to integrate the EditOrderPopup into your existing schedule order queue

interface ScheduleOrderItem {
  id: string;
  productionOrderId?: string;
  scheduleOrderId?: string;
  status: string;
  recipeName: string;
  estimatedStart: string;
  estimatedEnd: string;
  totalBarrels: number;
  // ... other fields
}

interface ScheduleOrderQueueProps {
  orders: ScheduleOrderItem[];
  onOrderUpdated: () => void; // Callback to refresh data after updates
}

export const ScheduleOrderQueue: React.FC<ScheduleOrderQueueProps> = ({
  orders,
  onOrderUpdated
}) => {
  const [editingOrder, setEditingOrder] = useState<ScheduleOrderItem | null>(null);
  const [isEditPopupOpen, setIsEditPopupOpen] = useState(false);

  const handleEditOrder = (order: ScheduleOrderItem) => {
    setEditingOrder(order);
    setIsEditPopupOpen(true);
  };

  const handleCloseEditPopup = () => {
    setIsEditPopupOpen(false);
    setEditingOrder(null);
  };

  const handleEditSuccess = () => {
    // Refresh the data after successful update
    onOrderUpdated();
    handleCloseEditPopup();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Schedule Order Queue</h2>
      
      <div className="grid gap-4">
        {orders.map((order) => (
          <div key={order.id} className="border rounded-lg p-4 flex justify-between items-center">
            <div className="space-y-2">
              <h3 className="font-semibold">{order.recipeName}</h3>
              <p className="text-sm text-gray-600">Status: {order.status}</p>
              <p className="text-sm text-gray-600">
                Estimated: {new Date(order.estimatedStart).toLocaleDateString()} - {new Date(order.estimatedEnd).toLocaleDateString()}
              </p>
              <p className="text-sm text-gray-600">Total Barrels: {order.totalBarrels}</p>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleEditOrder(order)}
              className="flex items-center gap-2"
            >
              <EditIcon className="h-4 w-4" />
              Edit
            </Button>
          </div>
        ))}
      </div>

      {/* Edit Order Popup */}
      <EditOrderPopup
        isOpen={isEditPopupOpen}
        onClose={handleCloseEditPopup}
        productionOrderId={editingOrder?.productionOrderId}
        scheduleOrderId={editingOrder?.scheduleOrderId}
        initialScheduleData={{
          ...(editingOrder?.status && { status: editingOrder.status as 'Complete' | 'Created' | 'InProgress' | 'Scheduled' }),
          ...(editingOrder?.recipeName && { recipeName: editingOrder.recipeName }),
          ...(editingOrder?.estimatedStart && { estimatedStart: editingOrder.estimatedStart }),
          ...(editingOrder?.estimatedEnd && { estimatedEnd: editingOrder.estimatedEnd }),
          ...(editingOrder?.totalBarrels !== undefined && { totalBarrels: editingOrder.totalBarrels }),
        }}
        onSuccess={handleEditSuccess}
      />
    </div>
  );
};

// Example of how to use the mutations directly in a custom component
export const CustomOrderEditor: React.FC<{ orderId: string }> = ({ orderId }) => {
  const { updateScheduleOrder, isUpdatingScheduleOrder } = useOrderMutations();

  const handleQuickStatusUpdate = async (newStatus: 'Complete' | 'Created' | 'InProgress' | 'Scheduled') => {
    const success = await updateScheduleOrder(orderId, {
      status: newStatus,
      updatedBy: 'current-user-id' // You would get this from your auth context
    });

    if (success) {
      console.log('Status updated successfully');
    }
  };

  return (
    <div className="flex gap-2">
      <Button 
        onClick={() => handleQuickStatusUpdate('InProgress')}
        disabled={isUpdatingScheduleOrder}
        size="sm"
      >
        Start
      </Button>
      <Button 
        onClick={() => handleQuickStatusUpdate('Complete')}
        disabled={isUpdatingScheduleOrder}
        size="sm"
      >
        Complete
      </Button>
    </div>
  );
};

// Example of batch operations
export const BatchOrderOperations: React.FC<{ orderIds: string[] }> = ({ orderIds }) => {
  const { updateScheduleOrder } = useOrderMutations();

  const handleBatchStatusUpdate = async (newStatus: 'Complete' | 'Created' | 'InProgress' | 'Scheduled') => {
    const promises = orderIds.map(id => 
      updateScheduleOrder(id, { 
        status: newStatus,
        updatedBy: 'current-user-id'
      })
    );

    try {
      const results = await Promise.all(promises);
      const successCount = results.filter(Boolean).length;
      console.log(`Updated ${successCount} out of ${orderIds.length} orders`);
    } catch (error) {
      console.error('Batch update failed:', error);
    }
  };

  return (
    <div className="flex gap-2">
      <Button onClick={() => handleBatchStatusUpdate('Scheduled')}>
        Schedule All
      </Button>
      <Button onClick={() => handleBatchStatusUpdate('InProgress')}>
        Start All
      </Button>
    </div>
  );
}; 