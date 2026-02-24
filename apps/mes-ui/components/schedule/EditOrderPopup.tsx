import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useOrderMutations } from '@/hooks/useOrderMutations';
import { ProductionOrderUpdateData, ScheduleOrderUpdateData } from '@/production-order-mutations';

interface EditOrderPopupProps {
  isOpen: boolean;
  onClose: () => void;
  productionOrderId?: string;
  scheduleOrderId?: string;
  initialProductionData?: Partial<ProductionOrderUpdateData>;
  initialScheduleData?: Partial<ScheduleOrderUpdateData>;
  onSuccess?: () => void;
}

export const EditOrderPopup: React.FC<EditOrderPopupProps> = ({
  isOpen,
  onClose,
  productionOrderId,
  scheduleOrderId,
  initialProductionData = {},
  initialScheduleData = {},
  onSuccess
}) => {
  const {
    updateProductionOrder,
    updateScheduleOrder,
    isUpdatingProductionOrder,
    isUpdatingScheduleOrder
  } = useOrderMutations();

  // Production Order State
  const [productionData, setProductionData] = useState<ProductionOrderUpdateData>({
    status: 'Planned',
    quantity: 0,
    completedCooks: 0,
    completedFermenters: 0,
    completedQuantity: 0,
    totalCooks: 0,
    totalFermenters: 0,
    containerType: 'SmallBarrel',
    ...initialProductionData
  });

  // Schedule Order State
  const [scheduleData, setScheduleData] = useState<ScheduleOrderUpdateData>({
    status: 'Created',
    duration: 0,
    totalBarrels: 0,
    totalProofGallons: 0,
    ...initialScheduleData
  });

  const [activeTab, setActiveTab] = useState<string>(
    productionOrderId ? 'production' : 'schedule'
  );

  // Reset form when popup opens/closes
  useEffect(() => {
    if (isOpen) {
      setProductionData({ ...initialProductionData });
      setScheduleData({ ...initialScheduleData });
    }
  }, [isOpen, initialProductionData, initialScheduleData]);

  const handleProductionSubmit = async () => {
    if (!productionOrderId) return;

    const success = await updateProductionOrder(productionOrderId, productionData);
    if (success) {
      onSuccess?.();
      onClose();
    }
  };

  const handleScheduleSubmit = async () => {
    if (!scheduleOrderId) return;

    const success = await updateScheduleOrder(scheduleOrderId, scheduleData);
    if (success) {
      onSuccess?.();
      onClose();
    }
  };

  const DatePicker = ({ 
    value, 
    onChange, 
    placeholder = "Select date" 
  }: { 
    value?: string; 
    onChange: (date: string) => void; 
    placeholder?: string;
  }) => {
    const [date, setDate] = useState<Date | undefined>(
      value ? new Date(value) : undefined
    );

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, "PPP") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(newDate) => {
              setDate(newDate);
              if (newDate) {
                onChange(newDate.toISOString());
              }
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Order</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            {productionOrderId && (
              <TabsTrigger value="production">Production Order</TabsTrigger>
            )}
            {scheduleOrderId && (
              <TabsTrigger value="schedule">Schedule Order</TabsTrigger>
            )}
          </TabsList>

          {productionOrderId && (
            <TabsContent value="production" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="prod-status">Status</Label>
                  <Select
                    value={productionData.status || ''}
                    onValueChange={(value: string) => 
                      setProductionData(prev => ({ ...prev, status: value as 'Committed' | 'Complete' | 'InProgress' | 'Initiated' | 'Planned' }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Planned">Planned</SelectItem>
                      <SelectItem value="Initiated">Initiated</SelectItem>
                      <SelectItem value="InProgress">In Progress</SelectItem>
                      <SelectItem value="Committed">Committed</SelectItem>
                      <SelectItem value="Complete">Complete</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prod-quantity">Quantity</Label>
                  <Input
                    id="prod-quantity"
                    type="number"
                    value={productionData.quantity || ''}
                    onChange={(e) => 
                      setProductionData(prev => ({ 
                        ...prev, 
                        quantity: parseFloat(e.target.value) || 0 
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <DatePicker
                    value={productionData.startDate || ''}
                    onChange={(date) => 
                      setProductionData(prev => ({ ...prev, startDate: date }))
                    }
                    placeholder="Select start date"
                  />
                </div>

                <div className="space-y-2">
                  <Label>End Date</Label>
                  <DatePicker
                    value={productionData.endDate || ''}
                    onChange={(date) => 
                      setProductionData(prev => ({ ...prev, endDate: date }))
                    }
                    placeholder="Select end date"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="completed-cooks">Completed Cooks</Label>
                  <Input
                    id="completed-cooks"
                    type="number"
                    value={productionData.completedCooks || ''}
                    onChange={(e) => 
                      setProductionData(prev => ({ 
                        ...prev, 
                        completedCooks: parseInt(e.target.value) || 0 
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="total-cooks">Total Cooks</Label>
                  <Input
                    id="total-cooks"
                    type="number"
                    value={productionData.totalCooks || ''}
                    onChange={(e) => 
                      setProductionData(prev => ({ 
                        ...prev, 
                        totalCooks: parseInt(e.target.value) || 0 
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="container-type">Container Type</Label>
                  <Select
                    value={productionData.containerType || ''}
                    onValueChange={(value: string) => 
                      setProductionData(prev => ({ ...prev, containerType: value as 'BulkLoadout' | 'IbcTote275' | 'LargeBarrel' | 'PlasticDrum' | 'SmallBarrel' | 'SsTote275' }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SmallBarrel">Small Barrel</SelectItem>
                      <SelectItem value="LargeBarrel">Large Barrel</SelectItem>
                      <SelectItem value="IbcTote275">IBC Tote 275</SelectItem>
                      <SelectItem value="SsTote275">SS Tote 275</SelectItem>
                      <SelectItem value="PlasticDrum">Plastic Drum</SelectItem>
                      <SelectItem value="BulkLoadout">Bulk Loadout</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="final-proof">Final Proof</Label>
                  <Input
                    id="final-proof"
                    type="number"
                    step="0.1"
                    value={productionData.finalProof || ''}
                    onChange={(e) => 
                      setProductionData(prev => ({ 
                        ...prev, 
                        finalProof: parseFloat(e.target.value) || 0 
                      }))
                    }
                  />
                </div>
              </div>
            </TabsContent>
          )}

          {scheduleOrderId && (
            <TabsContent value="schedule" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sched-status">Status</Label>
                  <Select
                    value={scheduleData.status || ''}
                    onValueChange={(value: string) => 
                      setScheduleData(prev => ({ ...prev, status: value as 'Complete' | 'Created' | 'InProgress' | 'Scheduled' }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Created">Created</SelectItem>
                      <SelectItem value="Scheduled">Scheduled</SelectItem>
                      <SelectItem value="InProgress">In Progress</SelectItem>
                      <SelectItem value="Complete">Complete</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Duration</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={scheduleData.duration || ''}
                    onChange={(e) => 
                      setScheduleData(prev => ({ 
                        ...prev, 
                        duration: parseFloat(e.target.value) || 0 
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Estimated Start</Label>
                  <DatePicker
                    value={scheduleData.estimatedStart || ''}
                    onChange={(date) => 
                      setScheduleData(prev => ({ ...prev, estimatedStart: date }))
                    }
                    placeholder="Select estimated start"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Estimated End</Label>
                  <DatePicker
                    value={scheduleData.estimatedEnd || ''}
                    onChange={(date) => 
                      setScheduleData(prev => ({ ...prev, estimatedEnd: date }))
                    }
                    placeholder="Select estimated end"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="total-barrels">Total Barrels</Label>
                  <Input
                    id="total-barrels"
                    type="number"
                    value={scheduleData.totalBarrels || ''}
                    onChange={(e) => 
                      setScheduleData(prev => ({ 
                        ...prev, 
                        totalBarrels: parseFloat(e.target.value) || 0 
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="total-proof-gallons">Total Proof Gallons</Label>
                  <Input
                    id="total-proof-gallons"
                    type="number"
                    value={scheduleData.totalProofGallons || ''}
                    onChange={(e) => 
                      setScheduleData(prev => ({ 
                        ...prev, 
                        totalProofGallons: parseFloat(e.target.value) || 0 
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recipe-name">Recipe Name</Label>
                  <Input
                    id="recipe-name"
                    value={scheduleData.recipeName || ''}
                    onChange={(e) => 
                      setScheduleData(prev => ({ ...prev, recipeName: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mashing-duration">Mashing Duration (hours)</Label>
                  <Input
                    id="mashing-duration"
                    type="number"
                    value={scheduleData.estimatedMashingDuration || ''}
                    onChange={(e) => 
                      setScheduleData(prev => ({ 
                        ...prev, 
                        estimatedMashingDuration: parseFloat(e.target.value) || 0 
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="total-production-duration">Total Production Duration (hours)</Label>
                  <Input
                    id="total-production-duration"
                    type="number"
                    value={scheduleData.estimatedTotalProductionDuration || ''}
                    onChange={(e) => 
                      setScheduleData(prev => ({ 
                        ...prev, 
                        estimatedTotalProductionDuration: parseFloat(e.target.value) || 0 
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fermentation-duration">Fermentation Duration (hours)</Label>
                  <Input
                    id="fermentation-duration"
                    type="number"
                    value={scheduleData.estimatedFermentationDuration || ''}
                    onChange={(e) => 
                      setScheduleData(prev => ({ 
                        ...prev, 
                        estimatedFermentationDuration: parseFloat(e.target.value) || 0 
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="distillation-duration">Distillation Duration (hours)</Label>
                  <Input
                    id="distillation-duration"
                    type="number"
                    value={scheduleData.estimatedDistillationDuration || ''}
                    onChange={(e) => 
                      setScheduleData(prev => ({ 
                        ...prev, 
                        estimatedDistillationDuration: parseFloat(e.target.value) || 0 
                      }))
                    }
                  />
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {activeTab === 'production' && productionOrderId && (
            <Button 
              onClick={handleProductionSubmit}
              disabled={isUpdatingProductionOrder}
            >
              {isUpdatingProductionOrder && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Update Production Order
            </Button>
          )}
          {activeTab === 'schedule' && scheduleOrderId && (
            <Button 
              onClick={handleScheduleSubmit}
              disabled={isUpdatingScheduleOrder}
            >
              {isUpdatingScheduleOrder && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Update Schedule Order
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 