"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Globe, Play, Square, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PageNodeData } from "@/lib/types";
import { useFlowStore } from "@/lib/store";

const nodeBaseStyles =
  "px-4 py-3 rounded-lg border-2 shadow-lg min-w-[160px] transition-all duration-200";

export const PageNode = memo(function PageNode({
  data,
  selected,
  id,
}: NodeProps<PageNodeData>) {
  const deleteNode = useFlowStore((state) => state.deleteNode);
  const validationErrors = useFlowStore((state) => state.validationErrors);
  const hasError = validationErrors.some((e) => e.nodeId === id);

  return (
    <div
      className={cn(
        nodeBaseStyles,
        "bg-card border-[var(--node-page)]",
        selected && "ring-2 ring-[var(--node-page)] ring-offset-2 ring-offset-background",
        hasError && "border-destructive ring-destructive"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-[var(--node-page)] !border-2 !border-background"
      />
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-[var(--node-page)]/20">
          <Globe className="w-4 h-4 text-[var(--node-page)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-foreground truncate">
            {data.label}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {data.method}{" "}
            {data.endpoint
              ? (() => { try { return new URL(data.endpoint).pathname; } catch { return data.endpoint; } })()
              : "/"}
          </div>
        </div>
        {selected && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteNode(id);
            }}
            className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-[var(--node-page)] !border-2 !border-background"
      />
    </div>
  );
});

export const StartNode = memo(function StartNode({
  data,
  selected,
  id,
}: NodeProps<PageNodeData>) {
  const deleteNode = useFlowStore((state) => state.deleteNode);

  return (
    <div
      className={cn(
        nodeBaseStyles,
        "bg-card border-[var(--node-start)]",
        selected && "ring-2 ring-[var(--node-start)] ring-offset-2 ring-offset-background"
      )}
    >
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-[var(--node-start)]/20">
          <Play className="w-4 h-4 text-[var(--node-start)]" />
        </div>
        <div className="flex-1">
          <div className="font-medium text-sm text-foreground">
            {data.label}
          </div>
          <div className="text-xs text-muted-foreground">Entry Point</div>
        </div>
        {selected && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteNode(id);
            }}
            className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-[var(--node-start)] !border-2 !border-background"
      />
    </div>
  );
});

export const EndNode = memo(function EndNode({
  data,
  selected,
  id,
}: NodeProps<PageNodeData>) {
  const deleteNode = useFlowStore((state) => state.deleteNode);

  return (
    <div
      className={cn(
        nodeBaseStyles,
        "bg-card border-[var(--node-end)]",
        selected && "ring-2 ring-[var(--node-end)] ring-offset-2 ring-offset-background"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-[var(--node-end)] !border-2 !border-background"
      />
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-[var(--node-end)]/20">
          <Square className="w-4 h-4 text-[var(--node-end)]" />
        </div>
        <div className="flex-1">
          <div className="font-medium text-sm text-foreground">
            {data.label}
          </div>
          <div className="text-xs text-muted-foreground">Exit Point</div>
        </div>
        {selected && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteNode(id);
            }}
            className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});

export const nodeTypes = {
  pageNode: PageNode,
  startNode: StartNode,
  endNode: EndNode,
};
