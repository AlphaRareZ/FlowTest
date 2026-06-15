import mongoose, { Schema, Document } from "mongoose";
import type {
  ProjectDocument,
  SimulationDocument,
  GraphData,
  SimulationConfig,
  SimulationSummary,
  ValidationError,
  SimulationStatus,
} from "../types";

// ─── Project ──────────────────────────────────────────────────────────────────

const GraphNodeSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    nodeType: { type: String, enum: ["page", "start", "end"], required: true },
    apiConfig: {
      url: String,
      method: { type: String, enum: ["GET", "POST", "PUT", "DELETE", "PATCH"] },
      headers: {
        type: Map,
        of: String,
        // Ensure the Map always serialises as a plain Record<string,string>
        // so that axios and the simulation engine never receive a Mongoose Map.
        get: (v: Map<string, string> | undefined) =>
          v ? Object.fromEntries(v.entries()) : undefined,
      },
      body: String,
    },
    position: { x: Number, y: Number },
  },
  { _id: false, toJSON: { getters: true }, toObject: { getters: true } }
);

const GraphEdgeSchema = new Schema(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    probability: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

const GraphDataSchema = new Schema(
  {
    nodes: [GraphNodeSchema],
    edges: [GraphEdgeSchema],
  },
  { _id: false }
);

export interface ProjectDoc extends Document, Omit<ProjectDocument, "id"> {}

const ProjectSchema = new Schema<ProjectDoc>(
  {
    name: { type: String, required: true, trim: true },
    graph: { type: GraphDataSchema, default: { nodes: [], edges: [] } },
  },
  { timestamps: true }
);

export const Project = mongoose.model<ProjectDoc>("Project", ProjectSchema);

// ─── Simulation ───────────────────────────────────────────────────────────────

const SimulationConfigSchema = new Schema(
  {
    numberOfUsers:       { type: Number, required: true },
    timeBetweenArrivals: { type: Number, required: true },
    simulationDuration:  { type: Number, required: true },
    maxStepsPerSession:  { type: Number, required: true },
    exitProbability:     { type: Number, required: true },
    // Optional fields — stored as Mixed so any shape is accepted without
    // maintaining a rigid sub-schema that would need updating every time
    // a new config knob is added.
    arrivalMode:         { type: String },
    thinkTime:           { type: Schema.Types.Mixed },
    maxConcurrentUsers:  { type: Number },
    behaviorProfiles:    { type: Schema.Types.Mixed },
    timeScale:           { type: Schema.Types.Mixed },
  },
  { _id: false }
);

export interface SimulationDoc extends Document, Omit<SimulationDocument, "id"> {}

const SimulationSchema = new Schema<SimulationDoc>(
  {
    projectId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "validating", "running", "completed", "error"],
      default: "pending",
    },
    config: { type: SimulationConfigSchema, required: true },
    graph: { type: GraphDataSchema, required: true },
    results: { type: Schema.Types.Mixed, default: null },
    validationErrors: { type: Schema.Types.Mixed, default: [] },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Simulation = mongoose.model<SimulationDoc>(
  "Simulation",
  SimulationSchema
);
