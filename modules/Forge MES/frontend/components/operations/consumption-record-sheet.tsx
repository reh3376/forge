"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { QrScanner } from "./qr-scanner";
import { useToast } from "@/hooks/use-toast";
import {
  CREATE_RECIPE_BOM_ACTUAL,
  SORecipeBomItemType,
} from "@/lib/api/graphql/bom-consumption";
import { QrCode } from "lucide-react";

interface ConsumptionRecordSheetProps {
  item: SORecipeBomItemType;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ConsumptionRecordSheet({
  item,
  isOpen,
  onClose,
  onSuccess,
}: ConsumptionRecordSheetProps) {
  const { toast } = useToast();
  const [showScanner, setShowScanner] = useState(false);
  const [formData, setFormData] = useState({
    lotNumber: "",
    quantity: "",
  });

  const [recordConsumption, { loading: recordLoading }] = useMutation(
    CREATE_RECIPE_BOM_ACTUAL,
    {
      onCompleted: () => {
        toast({
          title: "Success",
          description: "Consumption recorded successfully",
        });
        onSuccess?.();
        handleClose();
      },
      onError: (error) => {
        console.error("[ConsumptionSheet] Record error:", error);
        toast({
          variant: "destructive",
          title: "Failed to Record",
          description: error.message,
        });
      },
    }
  );

  // Handle QR scan - populate lot number
  const handleScan = (code: string) => {
    console.log("[ConsumptionSheet] Scanned code:", code);
    setShowScanner(false);
    setFormData((prev) => ({ ...prev, lotNumber: code }));

    toast({
      title: "Code Scanned",
      description: `Lot number set to: ${code}`,
    });
  };

  // Submit consumption record
  const handleSubmit = async () => {
    const quantity = parseFloat(formData.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Quantity",
        description: "Please enter a valid quantity",
      });
      return;
    }

    if (!formData.lotNumber.trim()) {
      toast({
        variant: "destructive",
        title: "Missing Lot Number",
        description: "Please enter or scan a lot number",
      });
      return;
    }

    try {
      await recordConsumption({
        variables: {
          data: {
            recipeBomItem: {
              connect: { id: item.id }
            },
            quantityPlanned: item.quantity || 0,
            quantityActual: quantity,
            lotNumber: formData.lotNumber,
            consumedAt: new Date().toISOString(),
            createdBy: "system", // TODO: Get from auth context
          },
        },
      });
    } catch (error) {
      console.error("[ConsumptionSheet] Submit error:", error);
    }
  };

  // Reset and close
  const handleClose = () => {
    setFormData({
      lotNumber: "",
      quantity: "",
    });
    setShowScanner(false);
    onClose();
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleClose}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="space-y-3">
            <SheetTitle className="text-lg sm:text-xl">Record Consumption</SheetTitle>
            <SheetDescription className="text-sm leading-relaxed break-words">
              {item.item?.itemName}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 sm:mt-6 space-y-4 sm:space-y-6 pb-4">
            {/* Material Info */}
            <div className="rounded-lg border p-3 sm:p-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="text-xs sm:text-sm font-medium">Required Quantity</span>
                <Badge variant="outline" className="self-start sm:self-auto text-xs sm:text-sm">
                  {item.quantity?.toFixed(2) || 0} {item.displayUnits?.abbreviation}
                </Badge>
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground break-all">
                {item.item?.itemNumber}
              </div>
            </div>

            {/* Lot Number Input */}
            <div className="space-y-2">
              <Label htmlFor="lotNumber" className="text-sm">Lot Number *</Label>
              <div className="flex gap-2">
                <Input
                  id="lotNumber"
                  placeholder="Enter or scan lot number"
                  value={formData.lotNumber}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      lotNumber: e.target.value,
                    }))
                  }
                  disabled={recordLoading}
                  className="text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowScanner(true)}
                  disabled={recordLoading}
                  className="shrink-0"
                >
                  <QrCode className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Scan QR code or enter manually
              </p>
            </div>

            {/* Quantity Input */}
            <div className="space-y-2">
              <Label htmlFor="quantity" className="text-sm">Quantity Consumed *</Label>
              <div className="flex gap-2">
                <Input
                  id="quantity"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      quantity: e.target.value,
                    }))
                  }
                  disabled={recordLoading}
                  className="text-sm"
                />
                <div className="flex items-center px-2 sm:px-3 border rounded-md bg-muted shrink-0 min-w-[50px] justify-center">
                  <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                    {item.displayUnits?.abbreviation || "units"}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Planned: {item.quantity || 0} {item.displayUnits?.abbreviation || "units"}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={recordLoading}
                className="flex-1 text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!formData.lotNumber || !formData.quantity || recordLoading}
                className="flex-1 text-sm"
              >
                {recordLoading ? "Recording..." : "Record Consumption"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* QR Scanner Modal */}
      {showScanner && (
        <QrScanner
          isOpen={showScanner}
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
          title="Scan Lot Number"
          description="Scan the QR code or barcode on the material"
        />
      )}
    </>
  );
}
