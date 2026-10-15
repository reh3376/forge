import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Search, Users, Package } from 'lucide-react';

interface ProductionOrder {
  id: string;
  name: string;
  customer: {
    id: string;
    name: string;
  };
  recipe: {
    id: string;
    Recipe: string;
    recipeGroup: {
      id: string;
      recipe: string;
    };
  };
  containerType: string;
  finalProof: number;
  quantity: number;
  status: string;
  createdAt: string;
}

interface CompatibleOrdersFinderProps {
  baseProductionOrderId: string;
  onGroupSelected?: (orderIds: string[]) => void;
}

export function CompatibleOrdersFinder({ 
  baseProductionOrderId, 
  onGroupSelected 
}: CompatibleOrdersFinderProps) {
  const [baseOrder, setBaseOrder] = useState<ProductionOrder | null>(null);
  const [compatibleOrders, setCompatibleOrders] = useState<ProductionOrder[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([baseProductionOrderId]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCompatibleOrders();
  }, [baseProductionOrderId]);

  const loadCompatibleOrders = async () => {
    setLoading(true);
    try {
      // Load the base order
      const baseResponse = await fetch(`/api/production-orders/${baseProductionOrderId}`);
      const base = await baseResponse.json();
      setBaseOrder(base);

      // Load compatible orders
      const compatibleResponse = await fetch(
        `/api/production-orders/${baseProductionOrderId}/compatible?limit=10`
      );
      const compatible = await compatibleResponse.json();
      setCompatibleOrders(compatible);
    } catch (error) {
      console.error('Error loading compatible orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOrderToggle = (orderId: string) => {
    setSelectedIds(prev => {
      const newIds = prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId];
      
      if (onGroupSelected) {
        onGroupSelected(newIds);
      }
      
      return newIds;
    });
  };

  if (!baseOrder) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading base order...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Base Order Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Base Production Order
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="font-medium">{baseOrder.name}</div>
            <div className="text-sm text-gray-600">
              Customer: {baseOrder.customer.name}
            </div>
            <div className="text-sm text-gray-600">
              Recipe: {baseOrder.recipe.Recipe}
            </div>
            <div className="text-sm text-gray-600">
              Mash Bill: {baseOrder.recipe.recipeGroup.recipe}
            </div>
            <div className="flex gap-2">
              <Badge variant="outline">{baseOrder.containerType}</Badge>
              <Badge variant="outline">{baseOrder.finalProof}°</Badge>
              <Badge variant="outline">{baseOrder.quantity} units</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compatible Orders */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Compatible Orders ({compatibleOrders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">Loading compatible orders...</div>
          ) : compatibleOrders.length === 0 ? (
            <Alert>
              <Search className="h-4 w-4" />
              <AlertDescription>
                No other compatible Production Orders found with the same mash bill.
                You can still create a Schedule Order with just the base order.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-gray-600 mb-3">
                These orders have the same mash bill and can be grouped together:
              </div>
              
              {compatibleOrders.map(order => (
                <div
                  key={order.id}
                  className={`p-3 border rounded cursor-pointer transition-colors ${
                    selectedIds.includes(order.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => handleOrderToggle(order.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{order.name}</div>
                      <div className="text-sm text-gray-600">
                        {order.customer.name} | {order.recipe.Recipe}
                      </div>
                      <div className="text-xs text-gray-500">
                        {order.containerType} | {order.finalProof}° | {order.quantity} units
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {/* Similarity indicators */}
                      {order.customer.id === baseOrder.customer.id && (
                        <Badge variant="secondary" className="text-xs">Same Customer</Badge>
                      )}
                      {order.containerType === baseOrder.containerType && (
                        <Badge variant="secondary" className="text-xs">Same Container</Badge>
                      )}
                      {order.finalProof === baseOrder.finalProof && (
                        <Badge variant="secondary" className="text-xs">Same Proof</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              <div className="pt-3 border-t">
                <div className="text-sm font-medium mb-2">
                  Selected: {selectedIds.length} orders (including base order)
                </div>
                <Button
                  onClick={() => onGroupSelected?.(selectedIds)}
                  disabled={selectedIds.length === 0}
                  className="w-full"
                >
                  Group Selected Orders into Schedule Order
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}