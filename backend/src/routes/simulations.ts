import { Router, Request, Response } from "express";
import { body, param, validationResult } from "express-validator";
import { Simulation } from "../models";
import { validateGraph, hasBlockingErrors } from "../engines/graph-engine";
import { getSimulationQueue } from "../workers/queue";
import { runSimulation } from "../engines/simulation-engine";
import type { GraphData, SimulationConfig } from "../types";

const router = Router();

function handleValidation(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

// ─── POST /simulations/validate ───────────────────────────────────────────────
// Stateless — just returns validation errors for the given graph.

router.post("/validate", async (req: Request, res: Response) => {
  const graph: GraphData = req.body.graph;
  if (!graph) {
    res.status(400).json({ error: "graph is required" });
    return;
  }
  const errors = validateGraph(graph);
  res.json({ valid: !hasBlockingErrors(errors), errors });
});

// ─── POST /simulations ────────────────────────────────────────────────────────
// Creates a simulation record and enqueues the job.

router.post(
  "/",
  [
    body("projectId").notEmpty(),
    body("graph").notEmpty(),
    body("config").notEmpty(),
  ],
  async (req: Request, res: Response) => {
    if (!handleValidation(req, res)) return;

    const graph: GraphData = req.body.graph;
    const config: SimulationConfig = req.body.config;

    // Validate before queuing
    const validationErrors = validateGraph(graph);
    if (hasBlockingErrors(validationErrors)) {
      res.status(422).json({
        error: "Graph has validation errors",
        validationErrors,
      });
      return;
    }

    try {
      // Persist the simulation record
      const simulation = await Simulation.create({
        projectId: req.body.projectId,
        status: "pending",
        config,
        graph,
        validationErrors,
      });

      const simId = simulation._id.toString();

      // Decide: use queue (Redis available) or run inline
      try {
        const queue = getSimulationQueue();
        await queue.add("run", {
          simulationId: simId,
          graph,
          config,
        });
      } catch {
        // Redis not available — run inline (blocks, but still works)
        console.warn("[simulations] Redis unavailable, running inline");
        runInline(simId, graph, config).catch((err) => {
          console.error("[simulations] Inline runner uncaught error:", err);
        });
      }

      res.status(201).json({ id: simId, status: "pending" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create simulation" });
    }
  }
);

// ─── GET /simulations/:id ─────────────────────────────────────────────────────

router.get(
  "/:id",
  [param("id").isMongoId()],
  async (req: Request, res: Response) => {
    if (!handleValidation(req, res)) return;
    try {
      const sim = await Simulation.findById(req.params.id);
      if (!sim) {
        res.status(404).json({ error: "Simulation not found" });
        return;
      }
      res.json(sim);
    } catch {
      res.status(500).json({ error: "Failed to fetch simulation" });
    }
  }
);

// ─── GET /simulations/:id/status ──────────────────────────────────────────────

router.get(
  "/:id/status",
  [param("id").isMongoId()],
  async (req: Request, res: Response) => {
    if (!handleValidation(req, res)) return;
    try {
      const sim = await Simulation.findById(req.params.id, "status startedAt completedAt");
      if (!sim) {
        res.status(404).json({ error: "Simulation not found" });
        return;
      }
      res.json({ id: req.params.id, status: sim.status, startedAt: sim.startedAt, completedAt: sim.completedAt });
    } catch {
      res.status(500).json({ error: "Failed to fetch status" });
    }
  }
);

// ─── GET /simulations/:id/results ─────────────────────────────────────────────

router.get(
  "/:id/results",
  [param("id").isMongoId()],
  async (req: Request, res: Response) => {
    if (!handleValidation(req, res)) return;
    try {
      const sim = await Simulation.findById(req.params.id, "status results");
      if (!sim) {
        res.status(404).json({ error: "Simulation not found" });
        return;
      }
      if (sim.status !== "completed") {
        res.status(202).json({ status: sim.status, results: null });
        return;
      }
      res.json({ status: sim.status, results: sim.results });
    } catch {
      res.status(500).json({ error: "Failed to fetch results" });
    }
  }
);

// ─── GET /simulations — list by projectId ─────────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  const { projectId } = req.query;
  const filter = projectId ? { projectId: String(projectId) } : {};
  try {
    const sims = await Simulation.find(filter, "projectId status createdAt completedAt config")
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(sims);
  } catch {
    res.status(500).json({ error: "Failed to list simulations" });
  }
});

// ─── Inline runner (fallback when Redis is unavailable) ───────────────────────

async function runInline(
  simulationId: string,
  graph: GraphData,
  config: SimulationConfig
): Promise<void> {
  try {
    await Simulation.findByIdAndUpdate(simulationId, {
      status: "running",
      startedAt: new Date(),
    });

    // FIX #6 — runSimulation returns a handle; await the result promise
    const handle = runSimulation(graph, config);
    const results = await handle.result;

    await Simulation.findByIdAndUpdate(simulationId, {
      status: "completed",
      results,
      completedAt: new Date(),
    });
  } catch (err) {
    // FIX #9: persist the error message so the frontend can surface it,
    // matching the behaviour of the BullMQ worker path.
    const message = err instanceof Error ? err.message : String(err);
    await Simulation.findByIdAndUpdate(simulationId, {
      status: "error",
      completedAt: new Date(),
      "results.error": message,
    });
  }
}

export default router;
