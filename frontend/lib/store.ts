"use client";

import { create } from "zustand";
import { startSimulation, validateGraphRemote } from "./api";
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from "@xyflow/react";
import type {
  FlowNode,
  FlowEdge,
  SimulationConfig,
  SimulationStatus,
  SimulationSummary,
  ValidationError,
  PageNodeData,
  EdgeData,
} from "./types";

interface FlowState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  simulationConfig: SimulationConfig;
  simulationStatus: SimulationStatus;
  simulationProgress: number;  // FIX #12: 0–1 progress value
  simulationResults: SimulationSummary | null;
  validationErrors: ValidationError[];

  isPropertiesPanelOpen: boolean;
  isSimulationPanelOpen: boolean;
  isResultsPanelOpen: boolean;

  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (type: PageNodeData["nodeType"], position: { x: number; y: number }) => void;
  updateNodeData: (nodeId: string, data: Partial<PageNodeData>) => void;
  updateEdgeData: (edgeId: string, data: Partial<EdgeData>) => void;
  deleteNode: (nodeId: string) => void;
  deleteEdge: (edgeId: string) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setSelectedEdge: (edgeId: string | null) => void;
  setSimulationConfig: (config: Partial<SimulationConfig>) => void;
  validateFlow: () => ValidationError[];
  clearValidationErrors: () => void;  // FIX #10
  runSimulation: () => Promise<void>;
  setSimulationStatus: (status: SimulationStatus) => void;
  togglePropertiesPanel: () => void;
  toggleSimulationPanel: () => void;
  toggleResultsPanel: () => void;
  clearSelection: () => void;
  saveToJson: () => string;
  loadFromJson: (json: string) => void;
}

const defaultSimulationConfig: SimulationConfig = {
  numberOfUsers: 100,
  timeBetweenArrivals: 1000,
  simulationDuration: 60_000,
  maxStepsPerSession: 10,
  exitProbability: 0.1,
  arrivalMode: "poisson",
  thinkTime: { mode: "uniform", minMs: 500, maxMs: 2000 },
  maxConcurrentUsers: 50,
  timeScale: {
    factor: 1,
    virtualDurationMs: 60_000,
  },
};

const initialNodes: FlowNode[] = [
  {
    id: "start-1",
    type: "startNode",
    position: { x: 100, y: 200 },
    data: { label: "Start", endpoint: "", method: "GET", nodeType: "start" },
  },
];

let nodeIdCounter = 1;

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: initialNodes,
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  simulationConfig: defaultSimulationConfig,
  simulationStatus: "idle",
  simulationProgress: 0,   // FIX #12
  simulationResults: null,
  validationErrors: [],
  isPropertiesPanelOpen: true,
  isSimulationPanelOpen: false,
  isResultsPanelOpen: false,

  // FIX #10: clear validation errors whenever the graph is modified so stale
  // warnings don't linger after the user has already fixed the issue.
  onNodesChange: (changes) => set({
    nodes: applyNodeChanges(changes, get().nodes),
    validationErrors: [],
  }),
  onEdgesChange: (changes) => set({
    edges: applyEdgeChanges(changes, get().edges),
    validationErrors: [],
  }),

  // FIX #11: assign a sensible default probability when a new edge is connected.
  // Split the budget equally across all outgoing edges from the source node so
  // the sum stays at 1.0, and update existing sibling edges proportionally.
  onConnect: (connection) => {
    const existingEdges = get().edges;
    const siblings = existingEdges.filter((e) => e.source === connection.source);
    const newCount = siblings.length + 1;
    const equalShare = parseFloat((1 / newCount).toFixed(4));

    // Rebalance siblings
    const rebalanced = existingEdges.map((e) =>
      e.source === connection.source
        ? { ...e, data: { ...e.data, probability: equalShare } }
        : e
    );

    const newEdge: FlowEdge = {
      ...connection,
      id: `edge-${Date.now()}`,
      data: { probability: equalShare },
      type: "smoothstep",
      animated: true,
    } as FlowEdge;

    set({ edges: addEdge(newEdge, rebalanced), validationErrors: [] });
  },

  addNode: (type, position) => {
    nodeIdCounter++;
    const nodeId = `${type}-${nodeIdCounter}-${Date.now()}`;
    const labels: Record<PageNodeData["nodeType"], string> = {
      page: `Page ${nodeIdCounter}`,
      start: "Start",
      end: "End",
    };
    const nodeTypes: Record<PageNodeData["nodeType"], string> = {
      page: "pageNode",
      start: "startNode",
      end: "endNode",
    };
    const newNode: FlowNode = {
      id: nodeId,
      type: nodeTypes[type],
      position,
      data: {
        label: labels[type],
        endpoint: type === "page" ? "https://api.example.com/endpoint" : "",
        method: "GET",
        nodeType: type,
      },
    };
    set({ nodes: [...get().nodes, newNode], selectedNodeId: nodeId, selectedEdgeId: null });
  },

  updateNodeData: (nodeId, data) =>
    set({ nodes: get().nodes.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n) }),

  updateEdgeData: (edgeId, data) =>
    set({ edges: get().edges.map((e) => e.id === edgeId ? { ...e, data: { ...e.data, ...data } } : e) }),

  deleteNode: (nodeId) => {
    // Find which edges are removed (both incoming and outgoing to/from nodeId)
    const removedEdgeIds = new Set(
      get().edges
        .filter((e) => e.source === nodeId || e.target === nodeId)
        .map((e) => e.id)
    );

    // Collect the source nodes of removed outgoing edges — these need rebalancing
    const affectedSources = new Set(
      get().edges
        .filter((e) => e.source !== nodeId && e.target === nodeId)
        .map((e) => e.source)
    );

    let remaining = get().edges.filter((e) => !removedEdgeIds.has(e.id));

    // Rebalance each affected source
    for (const sourceId of affectedSources) {
      const siblings = remaining.filter((e) => e.source === sourceId);
      if (siblings.length > 0) {
        const equalShare = parseFloat((1 / siblings.length).toFixed(4));
        remaining = remaining.map((e) =>
          e.source === sourceId
            ? { ...e, data: { ...e.data, probability: equalShare } }
            : e
        );
      }
    }

    set({
      nodes: get().nodes.filter((n) => n.id !== nodeId),
      edges: remaining,
      selectedNodeId: null,
      validationErrors: [],  // FIX #10: clear stale errors after deletion
    });
  },

  deleteEdge: (edgeId) => {
    const deletedEdge = get().edges.find((e) => e.id === edgeId);
    let remaining = get().edges.filter((e) => e.id !== edgeId);

    // Rebalance siblings from the same source so probabilities sum back to 1.
    if (deletedEdge) {
      const siblings = remaining.filter((e) => e.source === deletedEdge.source);
      if (siblings.length > 0) {
        const equalShare = parseFloat((1 / siblings.length).toFixed(4));
        remaining = remaining.map((e) =>
          e.source === deletedEdge.source
            ? { ...e, data: { ...e.data, probability: equalShare } }
            : e
        );
      }
    }

    set({
      edges: remaining,
      selectedEdgeId: null,
      validationErrors: [],  // FIX #10
    });
  },

  setSelectedNode: (nodeId) => set({
    selectedNodeId: nodeId,
    selectedEdgeId: null,
    isPropertiesPanelOpen: nodeId !== null,
  }),

  setSelectedEdge: (edgeId) => set({
    selectedEdgeId: edgeId,
    selectedNodeId: null,
    isPropertiesPanelOpen: edgeId !== null,
  }),

  clearSelection: () => set({ selectedNodeId: null, selectedEdgeId: null }),

  // FIX #10: explicit action to dismiss the validation panel
  clearValidationErrors: () => set({ validationErrors: [] }),

  setSimulationConfig: (config) =>
    set({ simulationConfig: { ...get().simulationConfig, ...config } }),

  validateFlow: () => {
    const { nodes, edges } = get();
    const errors: ValidationError[] = [];

    if (!nodes.some((n) => n.data.nodeType === "start")) {
      errors.push({ message: "Flow must have at least one Start node", type: "error" });
    }

    nodes.filter((n) => n.data.nodeType === "page").forEach((node) => {
      if (!node.data.endpoint?.trim()) {
        errors.push({ nodeId: node.id, message: `Node "${node.data.label}" is missing an API endpoint`, type: "error" });
      }
    });

    nodes.forEach((node) => {
      const outgoing = edges.filter((e) => e.source === node.id);
      if (outgoing.length > 0) {
        const total = outgoing.reduce((sum, e) => sum + (e.data?.probability ?? 0), 0);
        if (Math.abs(total - 1) > 0.01) {
          errors.push({
            nodeId: node.id,
            message: `Outgoing probabilities from "${node.data.label}" must sum to 1 (current: ${total.toFixed(2)})`,
            type: "warning",
          });
        }
      }
    });

    set({ validationErrors: errors });
    return errors;
  },

  runSimulation: async () => {
    const { validateFlow, nodes, edges, simulationConfig } = get();

    set({ simulationStatus: "validating", simulationProgress: 0, simulationResults: null });

    const localErrors = validateFlow();
    if (localErrors.some((e) => e.type === "error")) {
      set({ simulationStatus: "error" });
      return;
    }

    try {
      const { valid, errors: remoteErrors } = await validateGraphRemote(nodes, edges);
      if (!valid) {
        set({ simulationStatus: "error", validationErrors: remoteErrors });
        return;
      }
    } catch (err) {
      console.warn("[store] Remote validation failed, proceeding with local only:", err);
    }

    set({ simulationStatus: "running", simulationProgress: 0 });

    try {
      const results = await startSimulation(
        nodes,
        edges,
        simulationConfig,
        // FIX #12: wire progress callback to store state so the UI can render it.
        (pct) => set({ simulationProgress: pct })
      );
      set({
        simulationStatus: "completed",
        simulationProgress: 1,
        simulationResults: results,
        isResultsPanelOpen: true,
      });
    } catch (err) {
      console.error("[store] Simulation error:", err);
      set({ simulationStatus: "error", simulationProgress: 0 });
    }
  },

  setSimulationStatus: (status) => set({ simulationStatus: status }),
  togglePropertiesPanel: () => set({ isPropertiesPanelOpen: !get().isPropertiesPanelOpen }),
  toggleSimulationPanel: () => set({ isSimulationPanelOpen: !get().isSimulationPanelOpen }),
  toggleResultsPanel:    () => set({ isResultsPanelOpen:    !get().isResultsPanelOpen }),

  saveToJson: () => {
    const { nodes, edges, simulationConfig } = get();
    return JSON.stringify({ nodes, edges, simulationConfig }, null, 2);
  },

  loadFromJson: (json) => {
    try {
      const data = JSON.parse(json);
      set({
        nodes: data.nodes || [],
        edges: data.edges || [],
        simulationConfig: data.simulationConfig || defaultSimulationConfig,
        // Reset simulation state so stale results from a previous run don't
        // appear against the newly-loaded graph.
        simulationStatus: "idle",
        simulationProgress: 0,
        simulationResults: null,
        validationErrors: [],
        selectedNodeId: null,
        selectedEdgeId: null,
      });
    } catch (error) {
      console.error("Failed to load flow from JSON:", error);
    }
  },
}));
