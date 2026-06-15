import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import mongoose from "mongoose";

import projectsRouter from "./routes/projects";
import simulationsRouter from "./routes/simulations";
import { notFound, errorHandler } from "./middleware/error-handler";
import { startSimulationWorker } from "./workers/simulation-worker";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(","),
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    env: process.env.NODE_ENV,
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use("/api/projects", projectsRouter);
app.use("/api/simulations", simulationsRouter);

// ─── Error handlers ───────────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // 1. Connect MongoDB
  const mongoUri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/flowtest";
  try {
    await mongoose.connect(mongoUri);
    console.log(`[mongo] Connected to ${mongoUri}`);
  } catch (err) {
    console.error("[mongo] Failed to connect:", err);
    process.exit(1);
  }

  // 2. Start BullMQ worker (best-effort — won't crash if Redis is absent)
  try {
    startSimulationWorker();
    console.log("[worker] Simulation worker started");
  } catch (err) {
    console.warn("[worker] Could not start worker (Redis unavailable?):", err);
  }

  // 3. Start HTTP server
  app.listen(PORT, () => {
    console.log(`[server] FlowTest backend running on http://localhost:${PORT}`);
  });
}

bootstrap();
