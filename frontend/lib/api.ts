/**
 * lib/api.ts
 * -----------
 * Thin client that talks to the FlowTest backend.
 * Drop this file into the frontend and update lib/store.ts (see bottom of file).
 */

import type {
  FlowNode,
  FlowEdge,
  SimulationConfig,
  SimulationSummary,
  ValidationError,
} from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

// ─── Request helper ───────────────────────────────────────────────────────────

async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Graph payload builder ────────────────────────────────────────────────────
// Converts the frontend xyflow node/edge format to the backend's GraphData shape.

function buildGraphPayload(nodes: FlowNode[], edges: FlowEdge[]) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.data.label,
      nodeType: n.data.nodeType,
      apiConfig: {
        url: n.data.endpoint,
        method: n.data.method,
        headers: n.data.headers,
        body: n.data.body,
      },
      position: n.position,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      probability: e.data?.probability ?? 0,
    })),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ValidationResponse {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validates a flow graph against the backend rules.
 */
export async function validateGraphRemote(
  nodes: FlowNode[],
  edges: FlowEdge[]
): Promise<ValidationResponse> {
  return api<ValidationResponse>("/simulations/validate", {
    method: "POST",
    body: JSON.stringify({ graph: buildGraphPayload(nodes, edges) }),
  });
}

/**
 * Starts a simulation and polls until completion.
 * Returns the final SimulationSummary.
 */
export async function startSimulation(
  nodes: FlowNode[],
  edges: FlowEdge[],
  config: SimulationConfig,
  onProgress?: (pct: number) => void
): Promise<SimulationSummary> {
  // 1. Enqueue the simulation
  const { id: simId } = await api<{ id: string; status: string }>(
    "/simulations",
    {
      method: "POST",
      body: JSON.stringify({
        projectId: "frontend-session",
        graph: buildGraphPayload(nodes, edges),
        config,
      }),
    }
  );

  // 2. Poll for completion.
  // FIX #6: when time-scale is active the real wall-clock runtime is
  //   virtualDurationMs / timeScaleFactor, which may be much longer than
  //   simulationDuration.  Use the larger of the two estimates so we never
  //   time out while the backend is still running.
  const POLL_INTERVAL_MS = 1500;
  const ts = config.timeScale;
  const realSimMs =
    ts && ts.factor > 1 && ts.virtualDurationMs
      ? Math.max(config.simulationDuration, ts.virtualDurationMs / ts.factor)
      : config.simulationDuration;
  const MAX_WAIT_MS = realSimMs + 30_000; // real duration + 30s grace
  const deadline = Date.now() + MAX_WAIT_MS;

  // Allow up to this many consecutive network errors before giving up.
  const MAX_POLL_ERRORS = 5;
  let consecutivePollErrors = 0;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let status: string;
    try {
      ({ status } = await api<{ status: string }>(
        `/simulations/${simId}/status`
      ));
      consecutivePollErrors = 0; // reset on success
    } catch (err) {
      consecutivePollErrors++;
      if (consecutivePollErrors >= MAX_POLL_ERRORS) {
        throw new Error(
          `Polling failed ${MAX_POLL_ERRORS} times in a row: ${(err as Error).message}`
        );
      }
      // Transient error — wait and retry
      continue;
    }

    if (status === "completed") {
      const { results } = await api<{ status: string; results: SimulationSummary }>(
        `/simulations/${simId}/results`
      );
      return results;
    }

    if (status === "error") {
      // Try to fetch the error message from results if available.
      try {
        const errPayload = await api<{ status: string; results: { error?: string } | null }>(
          `/simulations/${simId}/results`
        );
        const msg = (errPayload.results as { error?: string } | null)?.error;
        throw new Error(msg ? `Simulation failed: ${msg}` : "Simulation failed on the server");
      } catch (fetchErr) {
        // If the results fetch itself fails, surface the original error.
        if ((fetchErr as Error).message.startsWith("Simulation failed")) throw fetchErr;
        throw new Error("Simulation failed on the server");
      }
    }

    // Report rough progress based on elapsed time
    if (onProgress) {
      const elapsed = Date.now() - (deadline - MAX_WAIT_MS);
      onProgress(Math.min(0.95, elapsed / config.simulationDuration));
    }
  }

  throw new Error("Simulation timed out");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Project persistence ──────────────────────────────────────────────────────

export async function saveProject(
  name: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  config: SimulationConfig
): Promise<{ id: string }> {
  return api<{ id: string }>("/projects", {
    method: "POST",
    body: JSON.stringify({ name, graph: buildGraphPayload(nodes, edges), config }),
  });
}

export async function listProjects(): Promise<
  { _id: string; name: string; updatedAt: string }[]
> {
  return api("/projects");
}

export async function loadProject(id: string): Promise<{
  graph: ReturnType<typeof buildGraphPayload>;
}> {
  return api(`/projects/${id}`);
}

/*
─────────────────────────────────────────────────────────────────────────────
HOW TO WIRE THIS INTO lib/store.ts
─────────────────────────────────────────────────────────────────────────────

Replace the `runSimulation` action in lib/store.ts with:

  runSimulation: async () => {
    const { nodes, edges, simulationConfig, validateFlow } = get();

    set({ simulationStatus: "validating" });

    // 1. Local validation (instant feedback)
    const localErrors = validateFlow();
    if (localErrors.some((e) => e.type === "error")) {
      set({ simulationStatus: "error" });
      return;
    }

    set({ simulationStatus: "running" });

    try {
      const results = await startSimulation(
        nodes,
        edges,
        simulationConfig,
        (pct) => console.log(`Simulation progress: ${Math.round(pct * 100)}%`)
      );

      set({
        simulationStatus: "completed",
        simulationResults: results,
        isResultsPanelOpen: true,
      });
    } catch (err) {
      console.error("Simulation error:", err);
      set({ simulationStatus: "error" });
    }
  },

Also add NEXT_PUBLIC_API_URL=http://localhost:3001/api to your frontend .env.local
─────────────────────────────────────────────────────────────────────────────
*/
