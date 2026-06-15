import { Worker, Job } from "bullmq";
import { Simulation } from "../models";
import { runSimulation } from "../engines/simulation-engine";
import { getRedisConnection } from "./queue";
import type { SimulationJobPayload } from "../types";

// Track active simulation handles so we can cancel them if the job is removed
// or the worker is shutting down. Map key = BullMQ job id.
const activeHandles = new Map<string, ReturnType<typeof runSimulation>>();

export function startSimulationWorker(): Worker {
  const worker = new Worker<SimulationJobPayload>(
    "simulations",
    async (job: Job<SimulationJobPayload>) => {
      const { simulationId, graph, config } = job.data;

      try {
        await Simulation.findByIdAndUpdate(simulationId, {
          status: "running",
          startedAt: new Date(),
        });

        // FIX #6 — runSimulation now returns a handle with cancel()
        const handle = runSimulation(graph, config, async (pct) => {
          await job.updateProgress(Math.round(pct * 100));
        });

        // Register so graceful shutdown / job removal can cancel it
        if (job.id) activeHandles.set(job.id, handle);

        const results = await handle.result;

        if (job.id) activeHandles.delete(job.id);

        await Simulation.findByIdAndUpdate(simulationId, {
          status: "completed",
          results,
          completedAt: new Date(),
        });

      } catch (err) {
        if (job.id) activeHandles.delete(job.id);
        const message = err instanceof Error ? err.message : String(err);
        await Simulation.findByIdAndUpdate(simulationId, {
          status: "error",
          completedAt: new Date(),
          "results.error": message,
        });
        throw err; // let BullMQ mark the job as failed
      }
    },
    { connection: getRedisConnection() }
  );

  worker.on("completed", (job) => {
    console.log(`[worker] Simulation job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] Simulation job ${job?.id} failed:`, err.message);
  });

  // FIX #6 — cancel running sessions on graceful shutdown
  worker.on("closing", () => {
    console.log(`[worker] Shutting down — cancelling ${activeHandles.size} active simulation(s)`);
    for (const handle of activeHandles.values()) {
      handle.cancel();
    }
    activeHandles.clear();
  });

  return worker;
}
