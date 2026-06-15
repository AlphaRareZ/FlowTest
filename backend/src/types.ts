// ─── Node / Edge types ────────────────────────────────────────────────────────

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
export type NodeType = "page" | "start" | "end";
export type SimulationStatus = "pending" | "validating" | "running" | "completed" | "error";

export interface ApiConfig {
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  nodeType: NodeType;
  apiConfig: ApiConfig;
  position: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  probability: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ─── Think time config ────────────────────────────────────────────────────────

export type ThinkTimeMode = "none" | "fixed" | "uniform";

export interface ThinkTimeConfig {
  mode: ThinkTimeMode;
  fixedMs?: number;
  minMs?: number;
  maxMs?: number;
}

// ─── Arrival mode ─────────────────────────────────────────────────────────────

export type ArrivalMode = "fixed" | "poisson";

// ─── User behavior profile ────────────────────────────────────────────────────

export interface UserBehaviorProfile {
  name: string;
  weight: number;
  thinkTime?: ThinkTimeConfig;
  exitProbability?: number;
  maxStepsPerSession?: number;
}

// ─── NEW: Diurnal traffic pattern ─────────────────────────────────────────────

/**
 * A single anchor point in the daily traffic curve.
 * hour: 0–23 (simulated hour of day)
 * multiplier: relative arrival rate at that hour (1.0 = baseline)
 */
export interface TrafficAnchor {
  hour: number;        // 0–23
  multiplier: number;  // relative rate (1.0 = baseline)
}

/**
 * A traffic burst — a sudden spike superimposed on the diurnal curve.
 * startHour / durationHours: when and how long (simulated time)
 * multiplier: how much to amplify the base rate during the burst
 */
export interface TrafficBurst {
  startHour: number;
  durationHours: number;
  multiplier: number;
  label?: string;      // e.g. "Flash Sale", "Breaking News"
}

// ─── NEW: Time-scaling config ─────────────────────────────────────────────────

/**
 * Controls compressed-time simulation.
 * timeScale = 144 → 10 real minutes simulates 24 hours
 *
 * virtualDurationMs: total virtual (simulated) time window in ms.
 *   Default: simulationDuration (backwards-compatible).
 *   Set to 86_400_000 to simulate a full 24-hour day.
 */
export interface TimeScaleConfig {
  /** Real-to-virtual time compression factor. Default 1 (no scaling). */
  factor: number;
  /**
   * Total simulated time window in ms.
   * Set to 86_400_000 for a full 24-hour simulation.
   * Defaults to simulationDuration when absent.
   */
  virtualDurationMs?: number;
  /** Hour-of-day anchors for the diurnal curve (optional). */
  diurnalPattern?: TrafficAnchor[];
  /** Instantaneous bursts superimposed on the diurnal curve (optional). */
  bursts?: TrafficBurst[];
}

// ─── Simulation config ────────────────────────────────────────────────────────

export interface SimulationConfig {
  numberOfUsers: number;
  timeBetweenArrivals: number;   // ms (base rate, before diurnal scaling)
  simulationDuration: number;    // real-wall-clock duration ms
  maxStepsPerSession: number;
  exitProbability: number;       // 0-1

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

// ─── Metrics / results ───────────────────────────────────────────────────────

export interface NodeMetrics {
  pageId: string;
  pageName: string;
  endpoint: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p95ResponseTime: number;
  responseTimes: number[];
}

export interface TimeSeriesPoint {
  /** Simulated (virtual) timestamp in ms from start of simulation */
  timestamp: number;
  responseTime: number;
  requestsPerSecond: number;
  /** Simulated hour of day (0–23) — populated when timeScale is used */
  hourOfDay?: number;
  /** Active concurrent sessions at this point */
  activeSessions?: number;
  /** Traffic multiplier from diurnal pattern at this point */
  trafficMultiplier?: number;
}

export interface SimulationSummary {
  totalRequests: number;
  avgResponseTime: number;
  successRate: number;
  errorRate: number;
  results: Omit<NodeMetrics, "responseTimes">[];
  timeSeriesData: TimeSeriesPoint[];
  // NEW — metadata for the frontend to render diurnal charts correctly
  meta?: {
    timeScaleFactor: number;
    virtualDurationMs: number;
    realDurationMs: number;
    peakHour?: number;
    peakRps?: number;
  };
}

// ─── Persisted documents ──────────────────────────────────────────────────────

export interface SimulationDocument {
  id: string;
  projectId: string;
  status: SimulationStatus;
  config: SimulationConfig;
  graph: GraphData;
  results: SimulationSummary | null;
  validationErrors: ValidationError[];
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface ProjectDocument {
  id: string;
  name: string;
  graph: GraphData;
  createdAt: Date;
  updatedAt: Date;
}

export interface SimulationJobPayload {
  simulationId: string;
  graph: GraphData;
  config: SimulationConfig;
}

export interface RequestResult {
  nodeId: string;
  statusCode: number;
  responseTime: number;
  success: boolean;
  error?: string;
  /** Virtual (simulated) timestamp in ms from start */
  timestamp: number;
}
