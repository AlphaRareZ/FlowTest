# FlowTest Backend

Backend for the Visual Markov-Based Website Performance Testing Simulator.

## Architecture

```
src/
├── index.ts                     # Express app + bootstrap
├── types.ts                     # Shared TypeScript types
├── models/
│   └── index.ts                 # Mongoose models (Project, Simulation)
├── engines/
│   ├── graph-engine.ts          # Graph validation logic
│   ├── load-engine.ts           # HTTP request execution (axios + retry)
│   └── simulation-engine.ts    # Markov walk + metrics aggregation
├── workers/
│   ├── queue.ts                 # BullMQ queue + Redis connection
│   └── simulation-worker.ts    # BullMQ worker process
├── routes/
│   ├── projects.ts              # CRUD /api/projects
│   └── simulations.ts          # /api/simulations (start, status, results, validate)
├── middleware/
│   └── error-handler.ts        # 404 + global error handler
└── frontend-client/
    └── api.ts                   # Drop into frontend lib/ to connect to this backend
```

## Prerequisites

| Service  | Version | Required |
|----------|---------|----------|
| Node.js  | ≥ 18    | Yes      |
| MongoDB  | ≥ 6     | Yes      |
| Redis    | ≥ 7     | Optional (falls back to inline runner) |

## Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your MongoDB URI and optional Redis details

npm install
npm run dev          # ts-node-dev with hot reload
# or
npm run build && npm start
```

## API Reference

### Health

| Method | Path      | Description          |
|--------|-----------|----------------------|
| GET    | /health   | Uptime + DB status   |

### Projects

| Method | Path              | Description         |
|--------|-------------------|---------------------|
| GET    | /api/projects     | List all projects   |
| POST   | /api/projects     | Create project      |
| GET    | /api/projects/:id | Get project         |
| PATCH  | /api/projects/:id | Update name/graph   |
| DELETE | /api/projects/:id | Delete project      |

**POST /api/projects body:**
```json
{
  "name": "My Flow",
  "graph": {
    "nodes": [...],
    "edges": [...]
  }
}
```

### Simulations

| Method | Path                          | Description                        |
|--------|-------------------------------|------------------------------------|
| POST   | /api/simulations/validate     | Validate graph (stateless)         |
| POST   | /api/simulations              | Start simulation (enqueues job)    |
| GET    | /api/simulations              | List simulations (?projectId=...)  |
| GET    | /api/simulations/:id          | Full simulation document           |
| GET    | /api/simulations/:id/status   | Lightweight status poll            |
| GET    | /api/simulations/:id/results  | Final results (202 if not done)    |

**POST /api/simulations body:**
```json
{
  "projectId": "...",
  "graph": {
    "nodes": [
      {
        "id": "node-1",
        "label": "Home",
        "nodeType": "page",
        "apiConfig": {
          "url": "https://api.example.com/home",
          "method": "GET",
          "headers": { "Authorization": "Bearer token" },
          "body": null
        },
        "position": { "x": 100, "y": 200 }
      }
    ],
    "edges": [
      {
        "id": "edge-1",
        "source": "node-1",
        "target": "node-2",
        "probability": 0.7
      }
    ]
  },
  "config": {
    "numberOfUsers": 20,
    "timeBetweenArrivals": 500,
    "simulationDuration": 30000,
    "maxStepsPerSession": 10,
    "exitProbability": 0.1
  }
}
```

**Results response shape** (matches frontend `SimulationSummary`):
```json
{
  "status": "completed",
  "results": {
    "totalRequests": 840,
    "avgResponseTime": 143,
    "successRate": 0.97,
    "errorRate": 0.03,
    "results": [
      {
        "pageId": "node-1",
        "pageName": "Home",
        "endpoint": "https://api.example.com/home",
        "totalRequests": 420,
        "successCount": 410,
        "errorCount": 10,
        "avgResponseTime": 120,
        "minResponseTime": 45,
        "maxResponseTime": 890,
        "p95ResponseTime": 340
      }
    ],
    "timeSeriesData": [
      { "timestamp": 0, "responseTime": 130, "requestsPerSecond": 12 },
      { "timestamp": 1000, "responseTime": 145, "requestsPerSecond": 18 }
    ]
  }
}
```

## Connecting to the Frontend

1. Copy `src/frontend-client/api.ts` into your frontend as `lib/api.ts`
2. Add to frontend `.env.local`:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:3001/api
   ```
3. Update `lib/store.ts` — replace the `runSimulation` action:
   ```ts
   import { startSimulation } from "./api";

   runSimulation: async () => {
     const { nodes, edges, simulationConfig, validateFlow } = get();

     set({ simulationStatus: "validating" });
     const localErrors = validateFlow();
     if (localErrors.some((e) => e.type === "error")) {
       set({ simulationStatus: "error" });
       return;
     }

     set({ simulationStatus: "running" });
     try {
       const results = await startSimulation(nodes, edges, simulationConfig);
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
   ```

## How the Simulation Works

1. **Validation** — graph-engine checks start node, valid URLs, probability sums
2. **Queueing** — simulation job is pushed to BullMQ (or runs inline if Redis is absent)
3. **Markov walk** — for each virtual user:
   - Start at the `start` node
   - Execute the HTTP request for the current page node
   - Sample next node using weighted random selection (edge probabilities)
   - Apply exit probability at each step
   - Stop at `end` node or when `maxStepsPerSession` is reached
4. **Metrics** — response times per node → avg, min, max, p95; bucketed into 1s time-series
5. **Persistence** — results stored in MongoDB, readable via `/results` endpoint

## Environment Variables

| Variable                  | Default                              | Description                        |
|---------------------------|--------------------------------------|------------------------------------|
| PORT                      | 3001                                 | HTTP server port                   |
| MONGODB_URI               | mongodb://localhost:27017/flowtest   | MongoDB connection string          |
| REDIS_HOST                | localhost                            | Redis host for BullMQ              |
| REDIS_PORT                | 6379                                 | Redis port                         |
| REDIS_PASSWORD            | (empty)                              | Redis password                     |
| CORS_ORIGINS              | http://localhost:3000                | Comma-separated allowed origins    |
| HTTP_REQUEST_TIMEOUT_MS   | 10000                                | Per-request timeout                |
| MAX_RETRIES               | 2                                    | Retry attempts on network errors   |
