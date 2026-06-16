"use client";

import { useState } from "react";
import {
  Play,
  Save,
  Upload,
  Download,
  Settings,
  AlertTriangle,
  CheckCircle,
  Loader2,
  BarChart3,
} from "lucide-react";
import { useFlowStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function TopBar() {
  const {
    simulationStatus,
    validationErrors,
    runSimulation,
    validateFlow,
    saveToJson,
    loadFromJson,
    toggleSimulationPanel,
    toggleResultsPanel,
    simulationResults,
  } = useFlowStore();

  const [jsonData, setJsonData] = useState("");
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);

  const handleValidate = () => {
    validateFlow();
  };

  const handleRun = async () => {
    await runSimulation();
  };

  const handleSave = () => {
    const json = saveToJson();
    setJsonData(json);
    setIsSaveDialogOpen(true);
  };

  const handleLoad = () => {
    loadFromJson(jsonData);
    setIsLoadDialogOpen(false);
    setJsonData("");
  };

  const handleDownload = () => {
    const json = saveToJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flow-diagram.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const errorCount = validationErrors.filter((e) => e.type === "error").length;
  const warningCount = validationErrors.filter((e) => e.type === "warning").length;

  return (
    <header className="h-14 border-b border-border bg-card px-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-accent-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-sm text-foreground">FlowTest</h1>
            <p className="text-xs text-muted-foreground">Visual Performance Testing</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Validation Status */}
        {validationErrors.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary">
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="w-3.5 h-3.5" />
                {errorCount} {errorCount === 1 ? "error" : "errors"}
              </span>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-[var(--warning)]">
                <AlertTriangle className="w-3.5 h-3.5" />
                {warningCount} {warningCount === 1 ? "warning" : "warnings"}
              </span>
            )}
          </div>
        )}

        <div className="h-6 w-px bg-border mx-2" />

        {/* File Operations */}
        <Dialog open={isLoadDialogOpen} onOpenChange={setIsLoadDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-2">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Load</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Load Flow Diagram</DialogTitle>
              <DialogDescription>
                Paste your saved JSON flow diagram below
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={jsonData}
              onChange={(e) => setJsonData(e.target.value)}
              placeholder='{"nodes": [...], "edges": [...]}'
              className="min-h-[200px] max-h-[50vh] overflow-y-auto font-mono text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsLoadDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleLoad}>Load</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-2" onClick={handleSave}>
              <Save className="w-4 h-4" />
              <span className="hidden sm:inline">Save</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Flow Diagram</DialogTitle>
              <DialogDescription>
                Copy the JSON below or download as a file
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={jsonData}
              readOnly
              className="min-h-[200px] max-h-[50vh] overflow-y-auto font-mono text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsSaveDialogOpen(false)}>
                Close
              </Button>
              <Button onClick={handleDownload} className="gap-2">
                <Download className="w-4 h-4" />
                Download
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="h-6 w-px bg-border mx-2" />

        {/* Configuration */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-2"
          onClick={toggleSimulationPanel}
        >
          <Settings className="w-4 h-4" />
          <span className="hidden sm:inline">Config</span>
        </Button>

        {/* Results */}
        {simulationResults && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-2"
            onClick={toggleResultsPanel}
          >
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">Results</span>
          </Button>
        )}

        <div className="h-6 w-px bg-border mx-2" />

        {/* Validate */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2"
          onClick={handleValidate}
        >
          <CheckCircle className="w-4 h-4" />
          <span className="hidden sm:inline">Validate</span>
        </Button>

        {/* Run Simulation */}
        <Button
          size="sm"
          className={cn(
            "h-8 gap-2",
            simulationStatus === "running" && "animate-pulse"
          )}
          onClick={handleRun}
          disabled={simulationStatus === "running" || simulationStatus === "validating"}
        >
          {simulationStatus === "running" || simulationStatus === "validating" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {simulationStatus === "running"
            ? "Running..."
            : simulationStatus === "validating"
            ? "Validating..."
            : "Run Simulation"}
        </Button>
      </div>
    </header>
  );
}
