import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Users, Package, AlertTriangle, CheckCircle } from 'lucide-react';

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
  scheduled: boolean;
}

interface GroupingCompatibilityResult {
  isCompatible: boolean;
  incompatibilityReasons: string[];
  warnings: string[];
}

interface ProductionOrderGroupingProps {
  onScheduleOrderCreated?: (scheduleOrder: any) => void;
}

export function ProductionOrderGrouping({ onScheduleOrderCreated }: ProductionOrderGroupingProps) {
  const [availableOrders, setAvailableOrders] = useState<ProductionOrder[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [compatibilityResult, setCompatibilityResult] = useState<GroupingCompatibilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [scheduleName, setScheduleName] = useState('');

  // Load available production orders that can be grouped
  useEffect(() => {
    loadAvailableOrders();
  }, []);

  const loadAvailableOrders = async () => {
    setLoading(true);
    try {
      // This would call the backend API to get unscheduled production orders
      const response = await fetch('/api/production-orders?scheduled=false&status=Initiated');
      const orders = await response.json();
      setAvailableOrders(orders);
    } catch (error) {
      console.error('Error loading production orders:', error);
    } finally {
      setLoading(false);
    }
  };

  // Validate grouping compatibility whenever selection changes
  useEffect(() => {
    if (selectedOrderIds.length > 0) {
      validateGrouping();
    } else {
      setCompatibilityResult(null);
    }
  }, [selectedOrderIds]);

  const validateGrouping = async () => {
    if (selectedOrderIds.length === 0) return;

    try {
      const response = await fetch('/api/schedule-orders/validate-grouping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productionOrderIds: selectedOrderIds })
      });
      const result = await response.json();
      setCompatibilityResult(result);
    } catch (error) {
      console.error('Error validating grouping:', error);
    }
  };

  const handleOrderSelection = (orderId: string, selected: boolean) => {
    if (selected) {
      setSelectedOrderIds(prev => [...prev, orderId]);
    } else {
      setSelectedOrderIds(prev => prev.filter(id => id !== orderId));
    }
  };

  const handleCreateScheduleOrder = async () => {
    if (!compatibilityResult?.isCompatible || selectedOrderIds.length === 0) {
      return;
    }

    setCreating(true);
    try {
      const response = await fetch('/api/schedule-orders/create-from-production-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productionOrderIds: selectedOrderIds,
          scheduleName: scheduleName || undefined,
          estimatedStart: new Date().toISOString(),
        })
      });
      
      const scheduleOrder = await response.json();
      
      // Reset form
      setSelectedOrderIds([]);
      setScheduleName('');
      setCompatibilityResult(null);
      
      // Reload available orders
      await loadAvailableOrders();
      
      // Notify parent component
      if (onScheduleOrderCreated) {
        onScheduleOrderCreated(scheduleOrder);
      }
    } catch (error) {
      console.error('Error creating schedule order:', error);
    } finally {
      setCreating(false);
    }
  };

  const filteredOrders = availableOrders.filter(order =>
    order.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.recipe.Recipe.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedOrders = availableOrders.filter(order => selectedOrderIds.includes(order.id));

  const getCompatibilityBadge = () => {
    if (!compatibilityResult) return null;
    
    if (compatibilityResult.isCompatible) {
      return (
        <Badge variant="success" className="flex items-center gap-1">
          <CheckCircle className="h-4 w-4" />
          Compatible for Grouping
        </Badge>
      );
    } else {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="h-4 w-4" />
          Incompatible
        </Badge>
      );
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Group Production Orders into Schedule Order
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-gray-600">
            Select compatible Production Orders to group into a single Schedule Order. 
            All orders must have the same mash bill (recipe group) for MES Phase 1 compliance.
          </div>
          
          {/* Search */}
          <div>
            <Input
              placeholder="Search production orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Available Orders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Available Production Orders
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredOrders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {loading ? 'Loading...' : 'No available production orders'}
                </div>
              ) : (
                filteredOrders.map(order => (
                  <div key={order.id} className="flex items-center space-x-2 p-3 border rounded">
                    <Checkbox
                      checked={selectedOrderIds.includes(order.id)}
                      onCheckedChange={(checked) => handleOrderSelection(order.id, !!checked)}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{order.name}</div>
                      <div className="text-sm text-gray-600">
                        {order.customer.name} | {order.recipe.Recipe}
                      </div>
                      <div className="text-xs text-gray-500">
                        {order.containerType} | {order.finalProof}° | {order.quantity} units
                      </div>
                      <div className="text-xs text-gray-400">
                        Mash Bill: {order.recipe.recipeGroup.recipe}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Selected Orders & Compatibility */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Selected for Grouping ({selectedOrderIds.length})
              {getCompatibilityBadge()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedOrders.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Select production orders to group
              </div>
            ) : (
              <>
                {/* Selected Orders List */}
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedOrders.map(order => (
                    <div key={order.id} className="p-2 bg-blue-50 rounded">
                      <div className="font-medium text-sm">{order.name}</div>
                      <div className="text-xs text-gray-600">
                        {order.customer.name} | {order.recipe.Recipe}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Compatibility Results */}
                {compatibilityResult && (
                  <div className="space-y-2">
                    {compatibilityResult.incompatibilityReasons.length > 0 && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <div className="font-medium">Cannot group these orders:</div>
                          <ul className="list-disc list-inside text-sm mt-1">
                            {compatibilityResult.incompatibilityReasons.map((reason, index) => (
                              <li key={index}>{reason}</li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}

                    {compatibilityResult.warnings.length > 0 && (
                      <Alert variant="warning">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <div className="font-medium">Warnings:</div>
                          <ul className="list-disc list-inside text-sm mt-1">
                            {compatibilityResult.warnings.map((warning, index) => (
                              <li key={index}>{warning}</li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}

                    {compatibilityResult.isCompatible && (
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-green-700">
                          ✓ Orders are compatible for grouping
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium mb-1">
                            Schedule Order Name (optional)
                          </label>
                          <Input
                            placeholder="Will auto-generate if empty"
                            value={scheduleName}
                            onChange={(e) => setScheduleName(e.target.value)}
                          />
                        </div>

                        <Button
                          onClick={handleCreateScheduleOrder}
                          disabled={creating}
                          className="w-full"
                        >
                          {creating ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Creating Schedule Order...
                            </>
                          ) : (
                            <>
                              <Package className="h-4 w-4 mr-2" />
                              Create Schedule Order
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}