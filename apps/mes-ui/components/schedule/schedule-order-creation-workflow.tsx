import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ProductionOrderGrouping } from '../production/production-order-grouping';
import { CompatibleOrdersFinder } from '../production/compatible-orders-finder';
import { ArrowRight, CheckCircle, Info, Calendar, Package } from 'lucide-react';

interface ScheduleOrderCreationWorkflowProps {
  mode?: 'create' | 'fromExisting';
  selectedProductionOrderId?: string;
}

export function ScheduleOrderCreationWorkflow({ 
  mode = 'create',
  selectedProductionOrderId 
}: ScheduleOrderCreationWorkflowProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [createdScheduleOrder, setCreatedScheduleOrder] = useState<any>(null);

  const handleScheduleOrderCreated = (scheduleOrder: any) => {
    setCreatedScheduleOrder(scheduleOrder);
    setCurrentStep(3);
  };

  const handleGroupSelected = (orderIds: string[]) => {
    setSelectedOrderIds(orderIds);
    // Could automatically move to next step or show confirmation
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center space-x-4 mb-6">
      {[1, 2, 3].map((step) => (
        <div key={step} className="flex items-center">
          <div className={`
            flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
            ${currentStep >= step 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-200 text-gray-600'
            }
          `}>
            {currentStep > step ? <CheckCircle className="h-4 w-4" /> : step}
          </div>
          <span className="ml-2 text-sm font-medium text-gray-900">
            {step === 1 && 'Select Orders'}
            {step === 2 && 'Configure Schedule'}
            {step === 3 && 'Complete'}
          </span>
          {step < 3 && (
            <ArrowRight className="h-4 w-4 text-gray-400 ml-4" />
          )}
        </div>
      ))}
    </div>
  );

  const renderMESPhase1Info = () => (
    <Alert className="mb-6">
      <Info className="h-4 w-4" />
      <AlertDescription>
        <div className="font-medium mb-1">MES Phase 1 Workflow</div>
        <div className="text-sm">
          This new workflow allows multiple Production Orders with the same mash bill 
          to be grouped into a single Schedule Order for production execution. 
          Production execution tracking (cooks, fermenters, yield) is now managed at the Schedule Order level.
        </div>
      </AlertDescription>
    </Alert>
  );

  const renderSuccessView = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Schedule Order Created Successfully
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="font-medium text-green-900">
              {createdScheduleOrder.name}
            </div>
            <div className="text-sm text-green-700">
              ID: {createdScheduleOrder.id}
            </div>
            <div className="text-sm text-green-700">
              Mash Bill: {createdScheduleOrder.recipeGroup?.recipe}
            </div>
          </div>

          <div className="space-y-2">
            <div className="font-medium">Production Orders Included:</div>
            {createdScheduleOrder.productionOrders?.map((order: any) => (
              <div key={order.id} className="p-2 bg-gray-50 rounded">
                <div className="text-sm font-medium">{order.name}</div>
                <div className="text-xs text-gray-600">
                  {order.customer?.name} | {order.containerType} | {order.finalProof}°
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-blue-50 rounded">
              <div className="text-sm font-medium text-blue-900">Total Cooks</div>
              <div className="text-lg font-bold text-blue-900">
                {createdScheduleOrder.totalCooks || 0}
              </div>
            </div>
            <div className="p-3 bg-blue-50 rounded">
              <div className="text-sm font-medium text-blue-900">Total Fermenters</div>
              <div className="text-lg font-bold text-blue-900">
                {createdScheduleOrder.totalFermenters || 0}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={() => window.location.href = `/schedule-orders/${createdScheduleOrder.id}`}
              className="flex-1"
            >
              <Calendar className="h-4 w-4 mr-2" />
              View Schedule Order
            </Button>
            <Button 
              variant="outline"
              onClick={() => {
                setCurrentStep(1);
                setCreatedScheduleOrder(null);
                setSelectedOrderIds([]);
              }}
              className="flex-1"
            >
              Create Another
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (currentStep === 3 && createdScheduleOrder) {
    return (
      <div>
        {renderStepIndicator()}
        {renderSuccessView()}
      </div>
    );
  }

  return (
    <div>
      {renderStepIndicator()}
      {renderMESPhase1Info()}

      <Tabs value={mode} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="create">Group Multiple Orders</TabsTrigger>
          <TabsTrigger value="fromExisting">From Existing Order</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="space-y-4">
          <ProductionOrderGrouping 
            onScheduleOrderCreated={handleScheduleOrderCreated}
          />
        </TabsContent>

        <TabsContent value="fromExisting" className="space-y-4">
          {selectedProductionOrderId ? (
            <CompatibleOrdersFinder
              baseProductionOrderId={selectedProductionOrderId}
              onGroupSelected={handleGroupSelected}
            />
          ) : (
            <Card>
              <CardContent className="p-6">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Select a Production Order to find compatible orders for grouping.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}