import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToastProps {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  onClose: () => void;
}

export function Toast({ title, description, variant = "default", onClose }: ToastProps) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full max-w-md rounded-lg border p-4 shadow-lg",
        {
          "bg-background border-border": variant === "default",
          "bg-destructive text-destructive-foreground border-destructive": variant === "destructive",
        }
      )}
    >
      <div className="flex-1 space-y-1">
        {title && <div className="font-semibold">{title}</div>}
        {description && <div className="text-sm opacity-90">{description}</div>}
      </div>
      <button
        onClick={onClose}
        className="ml-4 inline-flex shrink-0 items-center justify-center rounded-md p-1 hover:opacity-70"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          title={toast.title}
          description={toast.description}
          variant={toast.variant}
          onClose={() => dismiss(toast.id)}
        />
      ))}
    </div>
  );
}

// Re-export the hook for convenience
import { useToast } from "@/hooks/use-toast";
export { useToast };
