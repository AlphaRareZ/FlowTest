import type { GraphData, ValidationError } from "../types";

// ═════════════════════════════════════════════════════════════════════════════
// FIX #4 — Full graph validation layer
// All checks return structured errors (never throw) so callers can
// decide whether to block or warn.
// ═════════════════════════════════════════════════════════════════════════════

/** Tolerance for probability-sum checks */
const PROB_TOLERANCE = 0.01;

/**
 * Validates a graph structure before simulation.
 * Returns an array of ValidationErrors — empty array means the graph is valid.
 *
 * Checks performed:
 *  1. Exactly one start node exists
 *  2. Every page node has a valid, non-empty API URL
 *  3. Every page node HTTP method is a known verb
 *  4. Outgoing edge probabilities sum to ~1.0 per source node
 *  5. All edge probability values are in [0, 1]
 *  6. No edges reference nodes that don't exist (dangling edges)
 *  7. Disconnected nodes (no in-edges AND no out-edges)
 *  8. End nodes that are unreachable (no in-edges)
 *  9. Nodes with out-edges but probabilities all zero
 */
export function validateGraph(graph: GraphData): ValidationError[] {
  const { nodes, edges } = graph;
  const errors: ValidationError[] = [];

  const nodeIds = new Set(nodes.map((n) => n.id));

  // ── 1. Start node ──────────────────────────────────────────────────────────
  const startNodes = nodes.filter((n) => n.nodeType === "start");
  if (startNodes.length === 0) {
    errors.push({
      message: "Flow must have exactly one Start node",
      type: "error",
    });
  }
  if (startNodes.length > 1) {
    errors.push({
      message: `Flow has ${startNodes.length} Start nodes — only one is allowed`,
      type: "warning",
    });
  }

  // ── 2 & 3. Page node API config ────────────────────────────────────────────
  const VALID_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH"]);
  const pageNodes = nodes.filter((n) => n.nodeType === "page");

  for (const node of pageNodes) {
    const url = node.apiConfig?.url?.trim();

    if (!url) {
      errors.push({
        nodeId: node.id,
        message: `Node "${node.label}" is missing an API endpoint URL`,
        type: "error",
      });
    } else {
      try {
        new URL(url);
      } catch {
        errors.push({
          nodeId: node.id,
          message: `Node "${node.label}" has an invalid URL: "${url}"`,
          type: "error",
        });
      }
    }

    if (!VALID_METHODS.has(node.apiConfig?.method)) {
      errors.push({
        nodeId: node.id,
        message: `Node "${node.label}" has an unrecognised HTTP method: "${node.apiConfig?.method}"`,
        type: "error",
      });
    }
  }

  // ── 4 & 5. Edge probability validation ────────────────────────────────────
  const edgesBySource = new Map<string, typeof edges>();
  for (const edge of edges) {
    if (!edgesBySource.has(edge.source)) edgesBySource.set(edge.source, []);
    edgesBySource.get(edge.source)!.push(edge);

    // Per-edge range check (FIX #4 / original check #5)
    if (edge.probability < 0 || edge.probability > 1) {
      errors.push({
        edgeId: edge.id,
        message: `Edge probability must be between 0 and 1 (got ${edge.probability})`,
        type: "error",
      });
    }
  }

  for (const node of nodes) {
    if (node.nodeType === "end") continue;
    const outgoing = edgesBySource.get(node.id);
    if (!outgoing || outgoing.length === 0) continue;

    const total = outgoing.reduce((sum, e) => sum + (e.probability ?? 0), 0);

    // All-zero probabilities
    if (total === 0) {
      errors.push({
        nodeId: node.id,
        message: `All outgoing edge probabilities from "${node.label}" are zero — no transition is possible`,
        type: "error",
      });
    } else if (Math.abs(total - 1) > PROB_TOLERANCE) {
      errors.push({
        nodeId: node.id,
        message: `Outgoing probabilities from "${node.label}" sum to ${total.toFixed(3)} (expected 1.0 ± ${PROB_TOLERANCE})`,
        type: "warning",
      });
    }
  }

  // ── 6. Dangling edges (reference to non-existent node) ────────────────────
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push({
        edgeId: edge.id,
        message: `Edge references non-existent source node "${edge.source}"`,
        type: "error",
      });
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({
        edgeId: edge.id,
        message: `Edge references non-existent target node "${edge.target}"`,
        type: "error",
      });
    }
  }

  // ── 7. Disconnected nodes ──────────────────────────────────────────────────
  for (const node of nodes) {
    if (node.nodeType === "start" || node.nodeType === "end") continue;
    const hasOut = edges.some((e) => e.source === node.id);
    const hasIn  = edges.some((e) => e.target === node.id);
    if (!hasOut && !hasIn) {
      errors.push({
        nodeId: node.id,
        message: `Node "${node.label}" is not connected to the flow`,
        type: "warning",
      });
    }
  }

  // ── 8. Unreachable end nodes ───────────────────────────────────────────────
  const endNodes = nodes.filter((n) => n.nodeType === "end");
  for (const node of endNodes) {
    const hasIn = edges.some((e) => e.target === node.id);
    if (!hasIn) {
      errors.push({
        nodeId: node.id,
        message: `End node "${node.label}" has no incoming edges and can never be reached`,
        type: "warning",
      });
    }
  }

  return errors;
}

/**
 * Returns true if the validation result contains hard errors that
 * must block the simulation from starting.
 */
export function hasBlockingErrors(errors: ValidationError[]): boolean {
  return errors.some((e) => e.type === "error");
}
