import { executeRequest } from "./load-engine";
import type {
  GraphData,
  GraphNode,
  GraphEdge,
  SimulationConfig,
  RequestResult,
  NodeMetrics,
  TimeSeriesPoint,
  SimulationSummary,
  ThinkTimeConfig,
  UserBehaviorProfile,
  TrafficAnchor,
  TrafficBurst,
  TimeScaleConfig,
} from "../types";

// ═════════════════════════════════════════════════════════════════════════════
// Virtual Clock (Simulated Time)
// ═════════════════════════════════════════════════════════════════════════════

class VirtualClock {
  private readonly _realStart: number;
  private readonly _factor: number;

  constructor(factor: number) {
    this._realStart = Date.now();
    this._factor = factor;
  }

  get realElapsedMs(): number {
    return Date.now() - this._realStart;
  }

  get virtualElapsedMs(): number {
    return this.realElapsedMs * this._factor;
  }

  realDelayForVirtual(virtualMs: number): number {
    if (this._factor <= 1) return virtualMs;
    return virtualMs / this._factor;
  }

  hourOfDay(virtualElapsedMs: number): number {
    return Math.floor((virtualElapsedMs / 3_600_000) % 24);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Diurnal Traffic Pattern
// ═════════════════════════════════════════════════════════════════════════════

const DEFAULT_DIURNAL: TrafficAnchor[] = [
  { hour: 0,  multiplier: 0.10 },
  { hour: 3,  multiplier: 0.05 },
  { hour: 6,  multiplier: 0.20 },
  { hour: 8,  multiplier: 0.70 },
  { hour: 10, multiplier: 1.00 },
  { hour: 12, multiplier: 0.90 },
  { hour: 14, multiplier: 0.85 },
  { hour: 17, multiplier: 0.95 },
  { hour: 19, multiplier: 0.80 },
  { hour: 21, multiplier: 0.50 },
  { hour: 23, multiplier: 0.20 },
];

function interpolateMultiplier(anchors: TrafficAnchor[], fractionalHour: number): number {
  const sorted = [...anchors].sort((a, b) => a.hour - b.hour);
  const extended = [...sorted, { hour: 24, multiplier: sorted[0].multiplier }];

  for (let i = 0; i < extended.length - 1; i++) {
    const lo = extended[i];
    const hi = extended[i + 1];
    if (fractionalHour >= lo.hour && fractionalHour <= hi.hour) {
      const t = (fractionalHour - lo.hour) / (hi.hour - lo.hour);
      return lo.multiplier + t * (hi.multiplier - lo.multiplier);
    }
  }
  return 1.0;
}

function burstContribution(bursts: TrafficBurst[] | undefined, virtualElapsedMs: number): number {
  if (!bursts || bursts.length === 0) return 0;
  let extra = 0;
  for (const burst of bursts) {
    const startMs = burst.startHour * 3_600_000;
    const endMs   = startMs + burst.durationHours * 3_600_000;
    if (virtualElapsedMs >= startMs && virtualElapsedMs < endMs) {
      const span = endMs - startMs;
      const pos  = virtualElapsedMs - startMs;
      const ramp = span * 0.05;
      let shape = 1.0;
      if (pos < ramp)             shape = pos / ramp;
      else if (pos > span - ramp) shape = (span - pos) / ramp;
      extra += (burst.multiplier - 1.0) * shape;
    }
  }
  return extra;
}

function getEffectiveInterArrivalMs(
  baseInterArrivalMs: number,
  config: SimulationConfig,
  virtualElapsedMs: number
): number {
  const ts = config.timeScale;
  if (!ts || ts.factor <= 1) {
    return config.arrivalMode === "poisson"
      ? sampleExponential(baseInterArrivalMs)
      : baseInterArrivalMs;
  }

  const anchors = ts.diurnalPattern ?? DEFAULT_DIURNAL;
  const fractionalHour = (virtualElapsedMs / 3_600_000) % 24;
  const diurnalMultiplier = interpolateMultiplier(anchors, fractionalHour);
  const burstMult = burstContribution(ts.bursts, virtualElapsedMs);
  const totalMultiplier = Math.max(0.01, diurnalMultiplier + burstMult);

  const virtualInterArrival = baseInterArrivalMs / totalMultiplier;
  const realInterArrival = virtualInterArrival / ts.factor;

  return config.arrivalMode === "poisson"
    ? sampleExponential(realInterArrival)
    : realInterArrival;
}

// ═════════════════════════════════════════════════════════════════════════════
// Poisson sampling
// ═════════════════════════════════════════════════════════════════════════════

function sampleExponential(meanMs: number): number {
  if (meanMs <= 0) return 0;
  return -Math.log(1 - Math.random()) * meanMs;
}

// ═════════════════════════════════════════════════════════════════════════════
// Think time (scale-aware)
// ═════════════════════════════════════════════════════════════════════════════

function sampleThinkTime(cfg: ThinkTimeConfig | undefined, timeScaleFactor: number): number {
  let virtualMs = 0;
  if (!cfg || cfg.mode === "none") {
    virtualMs = 0;
  } else if (cfg.mode === "fixed") {
    virtualMs = cfg.fixedMs ?? 0;
  } else {
    const min = cfg.minMs ?? 0;
    const max = cfg.maxMs ?? 0;
    virtualMs = min + Math.random() * (max - min);
  }
  return timeScaleFactor > 1 ? virtualMs / timeScaleFactor : virtualMs;
}

// ═════════════════════════════════════════════════════════════════════════════
// Semaphore
// ═════════════════════════════════════════════════════════════════════════════

class Semaphore {
  private _running = 0;
  private _queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  acquire(): Promise<void> {
    if (this._running < this.limit) {
      this._running++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => { this._queue.push(resolve); });
  }

  release(): void {
    const next = this._queue.shift();
    if (next) { next(); } else { this._running--; }
  }

  get active(): number { return this._running; }
}

// ═════════════════════════════════════════════════════════════════════════════
// Precomputed cumulative transition table
// ═════════════════════════════════════════════════════════════════════════════

interface Transition {
  targetId: string;
  cumulative: number;
}

function buildAdjacency(edges: GraphEdge[]): Map<string, Transition[]> {
  const raw = new Map<string, { targetId: string; probability: number }[]>();
  for (const edge of edges) {
    if (!raw.has(edge.source)) raw.set(edge.source, []);
    raw.get(edge.source)!.push({ targetId: edge.target, probability: edge.probability });
  }
  const adjacency = new Map<string, Transition[]>();
  for (const [sourceId, transitions] of raw) {
    let cumulative = 0;
    adjacency.set(sourceId, transitions.map((t) => {
      cumulative += t.probability;
      return { targetId: t.targetId, cumulative };
    }));
  }
  return adjacency;
}

function selectNextNode(transitions: Transition[], exitProbability: number): string | null {
  if (Math.random() < exitProbability) return null;
  if (transitions.length === 0) return null;
  const r = Math.random() * transitions[transitions.length - 1].cumulative;
  for (const t of transitions) { if (r <= t.cumulative) return t.targetId; }
  return transitions[transitions.length - 1].targetId;
}

// ═════════════════════════════════════════════════════════════════════════════
// Variable session length via geometric distribution
//
// FIX #4: The hard cap is now maxStepsPerSession itself (not 3× it).
// The geometric mean is set to maxStepsPerSession so sessions naturally cluster
// around the configured value; the hard cap prevents runaway outliers at exactly
// the value the user configured, not 3× it.
// ═════════════════════════════════════════════════════════════════════════════

function sampleSessionLength(maxSteps: number): number {
  // Geometric(p) where p = 1 / maxSteps → expected value = maxSteps steps.
  const p = 1 / Math.max(maxSteps, 1);
  let steps = 0;
  while (steps < maxSteps) {
    steps++;
    if (Math.random() < p) break;
  }
  return steps;
}

// ═════════════════════════════════════════════════════════════════════════════
// Behavior profile resolution
//
// FIX #5: Weights are normalised before sampling to avoid the biased-last-item
// fallback when floating-point arithmetic leaves the sum slightly below 1.0.
// ═════════════════════════════════════════════════════════════════════════════

interface ResolvedProfile {
  thinkTime: ThinkTimeConfig | undefined;
  exitProbability: number;
  maxStepsPerSession: number;
}

function resolveProfile(config: SimulationConfig): ResolvedProfile {
  const profiles = config.behaviorProfiles;
  if (!profiles || profiles.length === 0) {
    return {
      thinkTime: config.thinkTime,
      exitProbability: config.exitProbability,
      maxStepsPerSession: config.maxStepsPerSession,
    };
  }

  // Normalise weights so they always sum to exactly 1.0.
  const totalWeight = profiles.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * totalWeight;
  let chosen: UserBehaviorProfile | undefined;
  for (const p of profiles) {
    r -= p.weight;
    if (r <= 0) { chosen = p; break; }
  }
  chosen = chosen ?? profiles[profiles.length - 1];

  return {
    thinkTime: chosen.thinkTime ?? config.thinkTime,
    exitProbability: chosen.exitProbability ?? config.exitProbability,
    maxStepsPerSession: chosen.maxStepsPerSession ?? config.maxStepsPerSession,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Metrics buffer
// ═════════════════════════════════════════════════════════════════════════════

class MetricsBuffer {
  private readonly _store: RequestResult[] = [];
  flush(batch: RequestResult[]): void { this._store.push(...batch); }
  get results(): RequestResult[] { return this._store; }
}

// ═════════════════════════════════════════════════════════════════════════════
// Cancellation token
// ═════════════════════════════════════════════════════════════════════════════

interface CancellationToken { cancelled: boolean; }

// ═════════════════════════════════════════════════════════════════════════════
// Event-Driven Session Scheduler
// ═════════════════════════════════════════════════════════════════════════════

interface SimEvent {
  virtualTimeMs: number;
  type: "USER_ARRIVAL";
  userId: number;
}

class EventQueue {
  private _events: SimEvent[] = [];

  push(event: SimEvent): void {
    // Binary-search for insertion point to maintain sorted order in O(log n).
    let lo = 0;
    let hi = this._events.length;
    const t = event.virtualTimeMs;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._events[mid].virtualTimeMs <= t) lo = mid + 1;
      else hi = mid;
    }
    this._events.splice(lo, 0, event);
  }

  pop(): SimEvent | undefined {
    return this._events.shift();
  }

  get size(): number { return this._events.length; }
}

function scheduleArrivals(
  config: SimulationConfig,
  virtualDurationMs: number
): EventQueue {
  const queue = new EventQueue();
  const ts = config.timeScale;
  const anchors = ts?.diurnalPattern ?? DEFAULT_DIURNAL;
  const bursts = ts?.bursts;

  let virtualCursor = 0;
  let userId = 0;

  while (virtualCursor < virtualDurationMs && userId < config.numberOfUsers) {
    queue.push({ virtualTimeMs: virtualCursor, type: "USER_ARRIVAL", userId });

    const diurnalM = interpolateMultiplier(anchors, (virtualCursor / 3_600_000) % 24);
    const burstM   = burstContribution(bursts, virtualCursor);
    const totalM   = Math.max(0.01, diurnalM + burstM);
    const baseVirtualGap = config.timeBetweenArrivals / totalM;

    const virtualGap = config.arrivalMode === "poisson"
      ? sampleExponential(baseVirtualGap)
      : baseVirtualGap;

    virtualCursor += virtualGap;
    userId++;
  }

  return queue;
}

// ═════════════════════════════════════════════════════════════════════════════
// Single user session
//
// FIX #1: steps++ now only fires when an actual page request is made, so
//         start/end node traversals don't silently consume session budget.
//
// FIX #2: The end-node early-exit now breaks BEFORE assigning nextId to
//         currentNodeId, so end nodes are never entered and the break is live.
// ═════════════════════════════════════════════════════════════════════════════

async function runSession(
  nodeMap: Map<string, GraphNode>,
  adjacency: Map<string, Transition[]>,
  startNodeId: string,
  config: SimulationConfig,
  clock: VirtualClock,
  token: CancellationToken
): Promise<RequestResult[]> {
  const profile = resolveProfile(config);
  const timeScaleFactor = config.timeScale?.factor ?? 1;

  // FIX #4: pass only maxSteps; the function no longer takes a separate meanSteps.
  const sessionLength = sampleSessionLength(profile.maxStepsPerSession);

  const localResults: RequestResult[] = [];
  let currentNodeId: string | null = startNodeId;
  let steps = 0;

  while (
    currentNodeId !== null &&
    steps < sessionLength &&
    !token.cancelled
  ) {
    const node = nodeMap.get(currentNodeId);
    if (!node) break;

    if (node.nodeType === "page") {
      const result = await executeRequest(node);

      // Stamp with virtual (simulated) time, not a wall-clock epoch.
      result.timestamp = clock.virtualElapsedMs;
      localResults.push(result);

      // FIX #1: only count a step when a real request was issued.
      steps++;

      const realThinkMs = sampleThinkTime(profile.thinkTime, timeScaleFactor);
      if (realThinkMs > 0 && !token.cancelled) {
        await sleep(realThinkMs);
      }
    }

    const transitions = adjacency.get(currentNodeId) ?? [];
    if (transitions.length === 0) break;

    const nextId = selectNextNode(transitions, profile.exitProbability);

    // FIX #2: bail out BEFORE assigning nextId so end nodes are never entered.
    if (nextId === null) break;
    const nextNode = nodeMap.get(nextId);
    if (nextNode?.nodeType === "end") break;

    currentNodeId = nextId;
  }

  return localResults;
}

// ═════════════════════════════════════════════════════════════════════════════
// Graph pre-flight validation
//
// FIX #7: Use the same PROB_TOLERANCE (0.01) as graph-engine.ts.
// ═════════════════════════════════════════════════════════════════════════════

const PROB_TOLERANCE = 0.01;

function assertRunnable(graph: GraphData, config: SimulationConfig): void {
  const startNodes = graph.nodes.filter((n) => n.nodeType === "start");
  if (startNodes.length === 0) throw new Error("Graph validation failed: no start node found");

  for (const node of graph.nodes.filter((n) => n.nodeType === "page")) {
    if (!node.apiConfig?.url?.trim()) {
      throw new Error(`Graph validation failed: node "${node.label}" has no API URL`);
    }
  }

  const edgesBySource = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) {
    if (!edgesBySource.has(edge.source)) edgesBySource.set(edge.source, []);
    edgesBySource.get(edge.source)!.push(edge);
  }
  for (const [sourceId, edges] of edgesBySource) {
    const sum = edges.reduce((s, e) => s + (e.probability ?? 0), 0);
    if (Math.abs(sum - 1) > PROB_TOLERANCE) {
      const node = graph.nodes.find((n) => n.id === sourceId);
      throw new Error(
        `Graph validation failed: probabilities from "${node?.label ?? sourceId}" sum to ${sum.toFixed(3)}`
      );
    }
  }

  if (config.behaviorProfiles && config.behaviorProfiles.length > 0) {
    const w = config.behaviorProfiles.reduce((s, p) => s + p.weight, 0);
    if (w <= 0) {
      throw new Error(`Config validation: behaviorProfile weights sum to ${w.toFixed(3)} — at least one profile must have a positive weight`);
    }
    // Non-unit sums are accepted here; resolveProfile() normalises them at runtime.
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Metrics aggregation (simulated-time-aware)
//
// FIX #8: p95 uses the correct nearest-rank formula:
//         Math.ceil(n * 0.95) - 1  instead of  Math.floor(n * 0.95)
// ═════════════════════════════════════════════════════════════════════════════

function aggregateResults(
  nodeMap: Map<string, GraphNode>,
  rawResults: RequestResult[],
  config: SimulationConfig,
  clock: VirtualClock
): SimulationSummary {
  const ts = config.timeScale;
  const timeScaleFactor = ts?.factor ?? 1;
  const virtualDuration = ts?.virtualDurationMs ?? config.simulationDuration;
  const anchors = ts?.diurnalPattern ?? DEFAULT_DIURNAL;

  // ── Per-node metrics ───────────────────────────────────────────────────────
  const nodeMetrics = new Map<string, NodeMetrics>();
  for (const node of nodeMap.values()) {
    if (node.nodeType !== "page") continue;
    nodeMetrics.set(node.id, {
      pageId: node.id,
      pageName: node.label,
      endpoint: node.apiConfig.url,
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      avgResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      p95ResponseTime: 0,
      responseTimes: [],
    });
  }

  for (const r of rawResults) {
    const m = nodeMetrics.get(r.nodeId);
    if (!m) continue;
    m.totalRequests++;
    if (r.success) m.successCount++; else m.errorCount++;
    m.responseTimes.push(r.responseTime);
    if (r.responseTime < m.minResponseTime) m.minResponseTime = r.responseTime;
    if (r.responseTime > m.maxResponseTime) m.maxResponseTime = r.responseTime;
  }

  for (const m of nodeMetrics.values()) {
    const times = m.responseTimes.slice().sort((a, b) => a - b);
    m.avgResponseTime = times.length > 0
      ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0;
    // FIX #8: nearest-rank p95 — ceil(n * 0.95) - 1, clamped to valid range.
    const p95idx = times.length > 0
      ? Math.min(Math.ceil(times.length * 0.95) - 1, times.length - 1)
      : 0;
    m.p95ResponseTime = times[p95idx] ?? 0;
    if (m.minResponseTime === Infinity) m.minResponseTime = 0;
  }

  // ── Time series ────────────────────────────────────────────────────────────
  const bucketSizeMs = timeScaleFactor > 1 ? 60_000 : 1_000;
  const totalBuckets = Math.ceil(virtualDuration / bucketSizeMs);
  const buckets = new Map<number, { responseTimes: number[]; count: number }>();

  for (const r of rawResults) {
    const bucket = Math.floor(r.timestamp / bucketSizeMs);
    if (!buckets.has(bucket)) buckets.set(bucket, { responseTimes: [], count: 0 });
    const b = buckets.get(bucket)!;
    b.responseTimes.push(r.responseTime);
    b.count++;
  }

  const timeSeriesData: TimeSeriesPoint[] = [];
  let peakRps = 0;
  let peakHour = 0;

  for (let i = 0; i < totalBuckets; i++) {
    const virtualMs = i * bucketSizeMs;
    const b = buckets.get(i);
    const responseTimes = b?.responseTimes ?? [];
    const count = b?.count ?? 0;
    const avgRt = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, c) => a + c, 0) / responseTimes.length)
      : 0;

    const rps = count / (bucketSizeMs / 1000);
    const hour = Math.floor((virtualMs / 3_600_000) % 24);
    const multiplier = timeScaleFactor > 1
      ? interpolateMultiplier(anchors, (virtualMs / 3_600_000) % 24)
      : 1;

    if (rps > peakRps) { peakRps = rps; peakHour = hour; }

    timeSeriesData.push({
      timestamp: virtualMs,
      responseTime: avgRt,
      requestsPerSecond: Math.round(rps * 10) / 10,
      hourOfDay: hour,
      trafficMultiplier: Math.round(multiplier * 100) / 100,
    });
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const metricsArray = Array.from(nodeMetrics.values());
  const totalRequests = metricsArray.reduce((s, m) => s + m.totalRequests, 0);
  const totalSuccess  = metricsArray.reduce((s, m) => s + m.successCount, 0);
  const totalErrors   = metricsArray.reduce((s, m) => s + m.errorCount, 0);
  const avgResponseTime = totalRequests > 0
    ? Math.round(rawResults.reduce((s, r) => s + r.responseTime, 0) / totalRequests)
    : 0;

  return {
    totalRequests,
    avgResponseTime,
    successRate: totalRequests > 0 ? totalSuccess / totalRequests : 0,
    errorRate:   totalRequests > 0 ? totalErrors  / totalRequests : 0,
    results: metricsArray.map(({ responseTimes: _, ...rest }) => rest),
    timeSeriesData,
    meta: {
      timeScaleFactor,
      virtualDurationMs: virtualDuration,
      realDurationMs: clock.realElapsedMs,
      peakHour,
      peakRps: Math.round(peakRps * 10) / 10,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Public handle
// ═════════════════════════════════════════════════════════════════════════════

export interface SimulationHandle {
  result: Promise<SimulationSummary>;
  cancel(): void;
}

// ═════════════════════════════════════════════════════════════════════════════
// Main runner
// ═════════════════════════════════════════════════════════════════════════════

export function runSimulation(
  graph: GraphData,
  config: SimulationConfig,
  onProgress?: (pct: number) => void
): SimulationHandle {
  assertRunnable(graph, config);

  const { nodes, edges } = graph;
  const nodeMap   = new Map<string, GraphNode>(nodes.map((n) => [n.id, n]));
  const adjacency = buildAdjacency(edges);
  const startNode = nodes.find((n) => n.nodeType === "start")!;

  const token: CancellationToken = { cancelled: false };
  const metricsBuffer = new MetricsBuffer();
  const concurrencyLimit = config.maxConcurrentUsers ?? config.numberOfUsers;
  const semaphore = new Semaphore(Math.max(1, concurrencyLimit));

  const timeScaleFactor = config.timeScale?.factor ?? 1;
  const clock = new VirtualClock(timeScaleFactor);

  const virtualDurationMs = config.timeScale?.virtualDurationMs ?? config.simulationDuration;
  const realEndTime = Date.now() + config.simulationDuration;

  async function _run(): Promise<SimulationSummary> {
    const sessionPromises: Promise<void>[] = [];
    const eventQueue = scheduleArrivals(config, virtualDurationMs);

    while (eventQueue.size > 0 && !token.cancelled) {
      const event = eventQueue.pop()!;

      if (Date.now() >= realEndTime) break;

      const virtualNow = clock.virtualElapsedMs;
      const virtualWait = Math.max(0, event.virtualTimeMs - virtualNow);
      const realWait = timeScaleFactor > 1 ? virtualWait / timeScaleFactor : virtualWait;
      if (realWait > 0 && !token.cancelled) {
        await sleep(Math.min(realWait, realEndTime - Date.now()));
      }

      if (token.cancelled || Date.now() >= realEndTime) break;

      await semaphore.acquire();
      if (token.cancelled) { semaphore.release(); break; }

      const sessionPromise = runSession(
        nodeMap, adjacency, startNode.id, config, clock, token
      ).then((batch) => {
        metricsBuffer.flush(batch);
        if (onProgress) {
          onProgress(Math.min(1, clock.realElapsedMs / config.simulationDuration));
        }
      }).finally(() => {
        semaphore.release();
      });

      sessionPromises.push(sessionPromise);
    }

    await Promise.allSettled(sessionPromises);
    return aggregateResults(nodeMap, metricsBuffer.results, config, clock);
  }

  return {
    result: _run(),
    cancel() { token.cancelled = true; },
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
