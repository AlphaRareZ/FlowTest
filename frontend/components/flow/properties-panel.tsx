"use client";

import { X, Globe, Play, Square, Link2, Trash2 } from "lucide-react";
import { useFlowStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import type { HttpMethod } from "@/lib/types";

const httpMethods: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH"];

export function PropertiesPanel() {
  const {
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    updateNodeData,
    updateEdgeData,
    deleteNode,
    deleteEdge,
    isPropertiesPanelOpen,
    togglePropertiesPanel,
  } = useFlowStore();

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);

  if (!isPropertiesPanelOpen || (!selectedNode && !selectedEdge)) {
    return null;
  }

  const getNodeIcon = () => {
    if (!selectedNode) return null;
    switch (selectedNode.data.nodeType) {
      case "start":
        return <Play className="w-4 h-4 text-[var(--node-start)]" />;
      case "end":
        return <Square className="w-4 h-4 text-[var(--node-end)]" />;
      default:
        return <Globe className="w-4 h-4 text-[var(--node-page)]" />;
    }
  };

  return (
    <aside className="w-80 border-l border-border bg-sidebar flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          {selectedNode ? getNodeIcon() : <Link2 className="w-4 h-4 text-muted-foreground" />}
          <h2 className="font-semibold text-sm text-foreground">
            {selectedNode ? "Node Properties" : "Edge Properties"}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={togglePropertiesPanel}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {selectedNode && (
          <>
            {/* Node Label */}
            <div className="space-y-2">
              <Label htmlFor="node-label" className="text-xs text-muted-foreground">
                Label
              </Label>
              <Input
                id="node-label"
                value={selectedNode.data.label}
                onChange={(e) =>
                  updateNodeData(selectedNode.id, { label: e.target.value })
                }
                placeholder="Enter node label"
                className="bg-input"
              />
            </div>

            {/* API Endpoint (for page nodes) */}
            {selectedNode.data.nodeType === "page" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="node-endpoint" className="text-xs text-muted-foreground">
                    API Endpoint
                  </Label>
                  <Input
                    id="node-endpoint"
                    value={selectedNode.data.endpoint}
                    onChange={(e) =>
                      updateNodeData(selectedNode.id, { endpoint: e.target.value })
                    }
                    placeholder="https://api.example.com/endpoint"
                    className="bg-input font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="node-method" className="text-xs text-muted-foreground">
                    HTTP Method
                  </Label>
                  <Select
                    value={selectedNode.data.method}
                    onValueChange={(value) =>
                      updateNodeData(selectedNode.id, { method: value as HttpMethod })
                    }
                  >
                    <SelectTrigger className="bg-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {httpMethods.map((method) => (
                        <SelectItem key={method} value={method}>
                          <span
                            className={
                              method === "GET"
                                ? "text-[var(--node-start)]"
                                : method === "POST"
                                ? "text-[var(--node-page)]"
                                : method === "DELETE"
                                ? "text-destructive"
                                : "text-[var(--warning)]"
                            }
                          >
                            {method}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="node-headers" className="text-xs text-muted-foreground">
                    Headers (JSON)
                  </Label>
                  <Textarea
                    id="node-headers"
                    value={
                      selectedNode.data.headers
                        ? JSON.stringify(selectedNode.data.headers, null, 2)
                        : ""
                    }
                    onChange={(e) => {
                      try {
                        const headers = JSON.parse(e.target.value);
                        updateNodeData(selectedNode.id, { headers });
                      } catch {
                        // Invalid JSON, ignore
                      }
                    }}
                    placeholder='{"Authorization": "Bearer token"}'
                    className="bg-input font-mono text-xs min-h-[80px]"
                  />
                </div>

                {(selectedNode.data.method === "POST" ||
                  selectedNode.data.method === "PUT" ||
                  selectedNode.data.method === "PATCH") && (
                  <div className="space-y-2">
                    <Label htmlFor="node-body" className="text-xs text-muted-foreground">
                      Request Body (JSON)
                    </Label>
                    <Textarea
                      id="node-body"
                      value={selectedNode.data.body || ""}
                      onChange={(e) =>
                        updateNodeData(selectedNode.id, { body: e.target.value })
                      }
                      placeholder='{"key": "value"}'
                      className="bg-input font-mono text-xs min-h-[100px]"
                    />
                  </div>
                )}
              </>
            )}

            {/* Delete Node */}
            <div className="pt-4 border-t border-border">
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => deleteNode(selectedNode.id)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Node
              </Button>
            </div>
          </>
        )}

        {selectedEdge && (
          <>
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-secondary/50">
                <div className="text-xs text-muted-foreground mb-1">Connection</div>
                <div className="text-sm text-foreground">
                  {nodes.find((n) => n.id === selectedEdge.source)?.data.label ||
                    "Unknown"}{" "}
                  →{" "}
                  {nodes.find((n) => n.id === selectedEdge.target)?.data.label ||
                    "Unknown"}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    Transition Probability
                  </Label>
                  <span className="text-sm font-mono text-foreground">
                    {(selectedEdge.data?.probability || 0).toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[selectedEdge.data?.probability || 0.5]}
                  onValueChange={([value]) =>
                    updateEdgeData(selectedEdge.id, { probability: value })
                  }
                  min={0}
                  max={1}
                  step={0.01}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Probability that a user will follow this path. All outgoing
                  probabilities from a node should sum to 1.
                </p>
              </div>
            </div>

            {/* Delete Edge */}
            <div className="pt-4 border-t border-border">
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => deleteEdge(selectedEdge.id)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Connection
              </Button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
