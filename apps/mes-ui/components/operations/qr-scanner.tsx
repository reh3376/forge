"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Camera, Keyboard, X } from "lucide-react";

interface QrScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  title?: string;
  description?: string;
  isOpen?: boolean;
}

/**
 * QR Scanner Modal Component
 * Uses React Portal to render at document.body level to avoid z-index issues
 * Supports both camera scanning and manual entry
 */
export function QrScanner({
  onScan,
  onClose,
  title = "Scan QR Code",
  description = "Position the QR code within the frame to scan",
  isOpen = true,
}: QrScannerProps) {
  const [scanMode, setScanMode] = useState<"camera" | "manual">("camera");
  const [manualInput, setManualInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // Handle successful scan
  const handleScan = useCallback(
    (result: any) => {
      console.log("[QrScanner] Raw scan result:", result);
      console.log("[QrScanner] isScanning:", isScanning);

      // Handle array result format from @yudiel/react-qr-scanner
      const scanData = Array.isArray(result) ? result[0] : result;

      if (scanData && scanData.rawValue && !isScanning) {
        setIsScanning(true);
        const code = scanData.rawValue;
        console.log("[QrScanner] ✅ Scanned code:", code);
        console.log("[QrScanner] Calling onScan callback...");
        setError(null);
        onScan(code);
        console.log("[QrScanner] onScan callback completed");
        // Reset after 1 second to allow continuous scanning if needed
        setTimeout(() => {
          console.log("[QrScanner] Resetting isScanning to false");
          setIsScanning(false);
        }, 1000);
      } else {
        console.log("[QrScanner] ❌ Scan ignored - scanData:", scanData, "isScanning:", isScanning);
      }
    },
    [onScan, isScanning]
  );

  // Handle scan errors
  const handleError = useCallback((error: any) => {
    console.error("QR Scanner Error:", error);

    // Check if it's a permission error
    if (
      error?.name === "NotAllowedError" ||
      error?.message?.includes("permission")
    ) {
      setPermissionDenied(true);
      setError(
        "Camera permission denied. Please enable camera access in your browser settings."
      );
    } else if (error?.name === "NotFoundError") {
      setError(
        "No camera found. Please ensure your device has a camera and it's properly connected."
      );
    } else {
      setError("Failed to access camera. Please try manual entry instead.");
    }
  }, []);

  // Handle manual entry submission
  const handleManualSubmit = () => {
    const trimmedInput = manualInput.trim();
    if (trimmedInput) {
      setError(null);
      onScan(trimmedInput);
      setManualInput("");
    } else {
      setError("Please enter a valid code");
    }
  };

  // Reset and close
  const handleClose = () => {
    console.log("[QrScanner] Closing scanner");
    setError(null);
    setManualInput("");
    setScanMode("camera");
    setPermissionDenied(false);
    onClose();
  };

  // Debug: Log component lifecycle
  useEffect(() => {
    console.log("[QrScanner] Component mounted/updated");
    console.log("[QrScanner] isOpen:", isOpen);
    console.log("[QrScanner] scanMode:", scanMode);
    console.log("[QrScanner] permissionDenied:", permissionDenied);
    console.log("[QrScanner] isScanning:", isScanning);
    console.log("[QrScanner] handleScan callback defined:", typeof handleScan);
    return () => {
      console.log("[QrScanner] Component unmounting or updating");
    };
  }, [isOpen, scanMode, permissionDenied, isScanning, handleScan]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm"
      style={{ pointerEvents: "auto" }}
      onClick={handleClose}
    >
      <div
        className="fixed inset-0 overflow-y-auto z-[100]"
        style={{ pointerEvents: "auto" }}
      >
        <div className="flex min-h-full items-center justify-center p-4">
          <Card
            className="w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Mode Toggle */}
              <div className="flex gap-2 pt-4">
                <Button
                  variant={scanMode === "camera" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setScanMode("camera")}
                  disabled={permissionDenied}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Camera
                </Button>
                <Button
                  variant={scanMode === "manual" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setScanMode("manual")}
                >
                  <Keyboard className="h-4 w-4 mr-2" />
                  Manual Entry
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Error Alert */}
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Camera Mode */}
              {scanMode === "camera" && !permissionDenied && (
                <div className="relative">
                  <div className="aspect-square w-full overflow-hidden rounded-lg bg-muted">
                    {console.log("[QrScanner] Rendering Scanner component with onScan callback")}
                    <Scanner
                      onScan={handleScan}
                      onError={handleError}
                      constraints={{
                        facingMode: "environment",
                        aspectRatio: 1,
                      }}
                      styles={{
                        container: {
                          width: "100%",
                          height: "100%",
                        },
                        video: {
                          objectFit: "cover",
                        },
                      }}
                      components={{
                        audio: false,
                        onOff: false,
                        torch: true,
                        zoom: false,
                        finder: true,
                      }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground text-center mt-2">
                    {isScanning ? "Processing..." : "Position QR code in frame"}
                  </p>
                </div>
              )}

              {/* Permission Denied Message */}
              {permissionDenied && scanMode === "camera" && (
                <div className="aspect-square w-full flex items-center justify-center rounded-lg bg-muted p-8">
                  <div className="text-center space-y-4">
                    <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
                    <div className="space-y-2">
                      <p className="font-semibold">Camera Access Required</p>
                      <p className="text-sm text-muted-foreground">
                        Please enable camera permissions in your browser settings and refresh the page.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setScanMode("manual")}
                    >
                      Use Manual Entry Instead
                    </Button>
                  </div>
                </div>
              )}

              {/* Manual Entry Mode */}
              {scanMode === "manual" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="manual-code">Enter Code</Label>
                    <Input
                      id="manual-code"
                      placeholder="Enter barcode or lot number"
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleManualSubmit();
                        }
                      }}
                      autoFocus
                    />
                  </div>
                  <Button
                    onClick={handleManualSubmit}
                    className="w-full"
                    disabled={!manualInput.trim()}
                  >
                    Submit
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  // Render in portal to avoid z-index stacking context issues
  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : null;
}
