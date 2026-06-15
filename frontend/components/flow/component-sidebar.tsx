"use client";

import { Globe, Play, Square } from "lucide-react";
import type { PageNodeData } from "@/lib/types";

interface DraggableNodeProps {
  type: PageNodeData["nodeType"];
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

function DraggableNode({ type, label, description, icon, color }: DraggableNodeProps) {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, type)}
      className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-secondary cursor-grab active:cursor-grabbing transition-colors group"
    >
      <div
        className="p-2 rounded-md transition-colors"
        style={{ backgroundColor: `${color}20` }}
      >
        <div style={{ color }}>{icon}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground truncate">{description}</div>
      </div>
    </div>
  );
}

export function ComponentSidebar() {
  return (
    <aside className="w-64 border-r border-border bg-sidebar flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <h2 className="font-semibold text-sm text-foreground">Components</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Drag and drop to canvas
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Entry Points
          </h3>
          <DraggableNode
            type="start"
            label="Start Node"
            description="User entry point"
            icon={<Play className="w-4 h-4" />}
            color="var(--node-start)"
          />
        </div>

        <div className="space-y-2 mt-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Pages
          </h3>
          <DraggableNode
            type="page"
            label="Page Node"
            description="API endpoint page"
            icon={<Globe className="w-4 h-4" />}
            color="var(--node-page)"
          />
        </div>

        <div className="space-y-2 mt-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Exit Points
          </h3>
          <DraggableNode
            type="end"
            label="End Node"
            description="Session termination"
            icon={<Square className="w-4 h-4" />}
            color="var(--node-end)"
          />
        </div>
      </div>

      <div className="p-4 border-t border-border">
        <div className="rounded-lg bg-secondary/50 p-3">
          <h4 className="text-xs font-medium text-foreground mb-1">Quick Tips</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Click nodes to edit properties</li>
            <li>• Connect nodes by dragging handles</li>
            <li>• Set probabilities on connections</li>
          </ul>
        </div>
      </div>
    </aside>
  );
}
