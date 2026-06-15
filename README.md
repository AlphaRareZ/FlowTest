# FlowTest

**Visual Markov-Based Website Performance Testing Simulator**

Build a flow graph of your web pages, set transition probabilities, and simulate real user traffic — all with live performance metrics.

---

## Architecture

```
flowtest/
├── frontend/        # Next.js 16 + React Flow + Zustand + shadcn/ui
├── backend/         # Express + MongoDB + Redis/BullMQ + TypeScript
└── docker-compose.yml
```

**How they connect:**

- Frontend runs on `http://localhost:3000`
- Backend API runs on `http://localhost:3001/api`
- Frontend calls the backend to validate graphs and run real simulations
- Backend uses **MongoDB** to persist projects & simulation results
- Backend uses **Redis + BullMQ** to queue and process simulation jobs

---

## Quick Start — Docker (Recommended)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
# Clone / unzip the project, then:
docker compose up --build
```

Open http://localhost:3000 — everything starts automatically.

---

## Quick Start — Local Dev

### Prerequisites

- Node.js 20+
- MongoDB running on `localhost:27017`
- Redis running on `localhost:6379`

The easiest way to run the infrastructure:

```bash
# Start only MongoDB + Redis via Docker
docker compose up mongo redis -d
```

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Configure environment

Backend (already copied from `.env.example`):

```
# backend/.env
PORT=3001
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/flowtest
REDIS_HOST=localhost
REDIS_PORT=6379
CORS_ORIGINS=http://localhost:3000
```

Frontend (already created):

```
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

### 3. Run both servers

```bash
npm run dev
```

This starts both the backend (`ts-node-dev`) and the frontend (`next dev`) concurrently with colour-coded output.

| Service  | URL                         |
|----------|-----------------------------|
| Frontend | http://localhost:3000        |
| Backend  | http://localhost:3001        |
| Health   | http://localhost:3001/health |

---

## How to Use

1. **Build your flow** — drag page nodes onto the canvas from the left sidebar
2. **Configure nodes** — click a node to set its API endpoint, method, headers, and body
3. **Set probabilities** — click edges to set transition probabilities (must sum to 1.0 per node)
4. **Configure simulation** — set number of users, arrival rate, and duration in the right panel
5. **Run** — click "Run Simulation" and watch real HTTP requests hit your endpoints
6. **Analyse results** — view response times, success rates, and per-page breakdowns

---

## API Reference

| Method | Path                              | Description                    |
|--------|-----------------------------------|--------------------------------|
| GET    | `/health`                         | Server health + DB status      |
| POST   | `/api/simulations/validate`       | Validate a flow graph          |
| POST   | `/api/simulations`                | Enqueue a new simulation       |
| GET    | `/api/simulations/:id/status`     | Poll simulation status         |
| GET    | `/api/simulations/:id/results`    | Fetch completed results        |
| GET    | `/api/projects`                   | List saved projects            |
| POST   | `/api/projects`                   | Save a project                 |
| GET    | `/api/projects/:id`               | Load a project                 |
| DELETE | `/api/projects/:id`               | Delete a project               |

---

## Project Structure

```
frontend/
├── app/                  # Next.js app router
├── components/
│   ├── flow/             # Core canvas components
│   │   ├── flow-canvas.tsx        # Main React Flow canvas
│   │   ├── component-sidebar.tsx  # Node palette
│   │   ├── properties-panel.tsx   # Node/edge config
│   │   ├── simulation-panel.tsx   # Sim config + run button
│   │   ├── results-panel.tsx      # Charts + metrics
│   │   ├── top-bar.tsx            # Save/load/export
│   │   └── custom-nodes.tsx       # Node renderers
│   └── ui/               # shadcn/ui components
├── lib/
│   ├── api.ts            # Backend HTTP client  ← wired in this setup
│   ├── store.ts          # Zustand global state ← uses real API now
│   └── types.ts          # Shared TypeScript types

backend/
├── src/
│   ├── index.ts          # Express app bootstrap
│   ├── routes/
│   │   ├── simulations.ts  # Simulation endpoints
│   │   └── projects.ts     # Project CRUD
│   ├── engines/
│   │   ├── graph-engine.ts      # Graph traversal + validation
│   │   ├── simulation-engine.ts # Markov chain runner
│   │   └── load-engine.ts       # Real HTTP request executor
│   ├── workers/
│   │   ├── simulation-worker.ts # BullMQ job processor
│   │   └── queue.ts             # Queue definition
│   ├── models/           # Mongoose schemas
│   ├── middleware/        # Error handlers
│   └── types.ts          # Shared backend types
```

---

## Tech Stack

| Layer     | Technology                                      |
|-----------|-------------------------------------------------|
| Frontend  | Next.js 16, React 19, TypeScript                |
| Canvas    | React Flow (@xyflow/react)                      |
| State     | Zustand                                         |
| UI        | shadcn/ui, Tailwind CSS v4, Radix UI            |
| Charts    | Recharts                                        |
| Backend   | Express 4, TypeScript, ts-node-dev              |
| Database  | MongoDB 7 + Mongoose                            |
| Queue     | Redis 7 + BullMQ                                |
| Infra     | Docker Compose                                  |
