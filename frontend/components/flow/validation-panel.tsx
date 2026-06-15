"use client";

import { AlertTriangle, AlertCircle, X } from "lucide-react";
import { useFlowStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// FIX #10: Panel is dismissible via an explicit close button.
//   Errors are also cleared automatically whenever the graph changes
//   (handled in the store's onNodesChange / onEdgesChange / deleteNode /
//   deleteEdge actions).

export function ValidationPanel() {
  const { validationErrors, setSelectedNode, clearValidationErrors } = useFlowStore();

  if (validationErrors.length === 0) {
    return null;
  }

  const errors   = validationErrors.filter((e) => e.type === "error");
  const warnings = validationErrors.filter((e) => e.type === "warning");

  return (
    <div className="absolute bottom-4 left-4 z-10 w-80 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
      <div className="p-3 border-b border-border flex items-center justify-between bg-secondary/50">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[var(--warning)]" />
          <span className="text-sm font-medium text-foreground">Validation Issues</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {errors.length} errors, {warnings.length} warnings
          </span>
          {/* FIX #10: dismiss button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={clearValidationErrors}
            aria-label="Dismiss validation issues"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="max-h-[200px] overflow-y-auto">
        {validationErrors.map((error, index) => (
          <button
            key={index}
            onClick={() => error.nodeId && setSelectedNode(error.nodeId)}
            className={cn(
              "w-full text-left p-3 border-b border-border last:border-b-0 hover:bg-secondary/50 transition-colors",
              error.nodeId && "cursor-pointer"
            )}
          >
            <div className="flex items-start gap-2">
              {error.type === "error" ? (
                <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-[var(--warning)] shrink-0 mt-0.5" />
              )}
              <p className="text-xs text-foreground">{error.message}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
