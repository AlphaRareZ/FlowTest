"use client";

import { useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useFlowStore } from "@/lib/store";
import { nodeTypes } from "./custom-nodes";
import type { PageNodeData } from "@/lib/types";

export function FlowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setSelectedNode,
    setSelectedEdge,
    clearSelection,
    addNode,
  } = useFlowStore();

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance;
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData(
        "application/reactflow"
      ) as PageNodeData["nodeType"];

      if (typeof type === "undefined" || !type) {
        return;
      }

      if (!reactFlowWrapper.current || !reactFlowInstance.current) {
        return;
      }

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      addNode(type, position);
    },
    [addNode]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: { id: string }) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode]
  );

  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: { id: string }) => {
      setSelectedEdge(edge.id);
    },
    [setSelectedEdge]
  );

  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={onInit}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: true,
          style: { strokeWidth: 2, stroke: "var(--border)" },
        }}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
      >
        <Background
          gap={16}
          size={1}
          color="var(--canvas-grid)"
          className="bg-background"
        />
        <Controls
          className="!bg-card !border-border !rounded-lg !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-secondary"
          showZoom
          showFitView
          showInteractive={false}
        />
        <MiniMap
          className="!bg-card !border-border !rounded-lg !shadow-lg"
          nodeColor={(node) => {
            switch (node.data?.nodeType) {
              case "start":
                return "var(--node-start)";
              case "end":
                return "var(--node-end)";
              default:
                return "var(--node-page)";
            }
          }}
          maskColor="rgba(0, 0, 0, 0.8)"
        />
        <Panel position="bottom-center" className="!mb-4">
          <div className="bg-card/80 backdrop-blur-sm border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground">
            Drag components from the sidebar to add pages. Connect nodes to define navigation flow.
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
