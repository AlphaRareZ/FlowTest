import { Queue } from "bullmq";
import Redis from "ioredis";
import type { SimulationJobPayload } from "../types";

let redisConnection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!redisConnection) {
    redisConnection = new Redis({
      host: process.env.REDIS_HOST ?? "localhost",
      port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null, // required by BullMQ
    });
  }
  return redisConnection;
}

let simulationQueue: Queue<SimulationJobPayload> | null = null;

export function getSimulationQueue(): Queue<SimulationJobPayload> {
  if (!simulationQueue) {
    simulationQueue = new Queue<SimulationJobPayload>("simulations", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return simulationQueue;
}
