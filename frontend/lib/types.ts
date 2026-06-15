import type { Node, Edge } from "@xyflow/react";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface PageNodeData {
  label: string;
  endpoint: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: string;
  nodeType: "page" | "start" | "end";
}

export interface EdgeData {
  probability: number;
}

export type FlowNode = Node<PageNodeData>;
export type FlowEdge = Edge<EdgeData>;

// ─── Think time ───────────────────────────────────────────────────────────────

export type ThinkTimeMode = "none" | "fixed" | "uniform";

export interface ThinkTimeConfig {
  mode: ThinkTimeMode;
  fixedMs?: number;
  minMs?: number;
  maxMs?: number;
}

// ─── Arrival mode ─────────────────────────────────────────────────────────────

export type ArrivalMode = "fixed" | "poisson";

// ─── User behavior profiles ───────────────────────────────────────────────────

export interface UserBehaviorProfile {
  name: string;
  weight: number;
  thinkTime?: ThinkTimeConfig;
  exitProbability?: number;
  maxStepsPerSession?: number;
}

// ─── NEW: Diurnal / time-scaling ─────────────────────────────────────────────

export interface TrafficAnchor {
  hour: number;        // 0–23
  multiplier: number;  // relative arrival rate
}

export interface TrafficBurst {
  startHour: number;
  durationHours: number;
  multiplier: number;
  label?: string;
}

export interface TimeScaleConfig {
  /** Real-to-virtual compression factor (e.g. 144 = 10 min simulates 24 h) */
  factor: number;
  /** Total simulated time window ms. Default: simulationDuration. */
  virtualDurationMs?: number;
  diurnalPattern?: TrafficAnchor[];
  bursts?: TrafficBurst[];
}

// ─── Simulation config ────────────────────────────────────────────────────────

export interface SimulationConfig {
  numberOfUsers: number;
  timeBetweenArrivals: number;
  simulationDuration: number;
  maxStepsPerSession: number;
  exitProbability: number;

  arrivalMode?: ArrivalMode;
  thinkTime?: ThinkTimeConfig;
  maxConcurrentUsers?: number;
  behaviorProfiles?: UserBehaviorProfile[];

  // NEW
  timeScale?: TimeScaleConfig;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationError {
  nodeId?: string;
  edgeId?: string;
  message: string;
  type: "error" | "warning";
}

// ─── Results ──────────────────────────────────────────────────────────────────

export interface SimulationResult {
  pageId: string;
  pageName: string;
  endpoint: string;
  avgResponseTime: number;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  minResponseTime?: number;
  maxResponseTime?: number;
  p95ResponseTime?: number;
}

export interface TimeSeriesPoint {
  timestamp: number;
  responseTime: number;
  requestsPerSecond: number;
  hourOfDay?: number;
  trafficMultiplier?: number;
  activeSessions?: number;
}

export interface SimulationSummary {
  totalRequests: number;
  avgResponseTime: number;
  successRate: number;
  errorRate: number;
  results: SimulationResult[];
  timeSeriesData: TimeSeriesPoint[];
  meta?: {
    timeScaleFactor: number;
    virtualDurationMs: number;
    realDurationMs: number;
    peakHour?: number;
    peakRps?: number;
  };
}

export type SimulationStatus = "idle" | "validating" | "running" | "completed" | "error";
