import { Router, Request, Response } from "express";
import { body, param, validationResult } from "express-validator";
import { Project } from "../models";

const router = Router();

// ─── Helper ───────────────────────────────────────────────────────────────────

function handleValidation(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

// ─── GET /projects ────────────────────────────────────────────────────────────

router.get("/", async (_req: Request, res: Response) => {
  try {
    const projects = await Project.find({}, "name createdAt updatedAt").sort({
      updatedAt: -1,
    });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// ─── GET /projects/:id ────────────────────────────────────────────────────────

router.get(
  "/:id",
  [param("id").isMongoId()],
  async (req: Request, res: Response) => {
    if (!handleValidation(req, res)) return;
    try {
      const project = await Project.findById(req.params.id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json(project);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch project" });
    }
  }
);

// ─── POST /projects ───────────────────────────────────────────────────────────

router.post(
  "/",
  [body("name").trim().notEmpty().withMessage("name is required")],
  async (req: Request, res: Response) => {
    if (!handleValidation(req, res)) return;
    try {
      const project = await Project.create({
        name: req.body.name,
        graph: req.body.graph ?? { nodes: [], edges: [] },
      });
      res.status(201).json(project);
    } catch (err) {
      res.status(500).json({ error: "Failed to create project" });
    }
  }
);

// ─── PATCH /projects/:id ──────────────────────────────────────────────────────

router.patch(
  "/:id",
  [param("id").isMongoId()],
  async (req: Request, res: Response) => {
    if (!handleValidation(req, res)) return;
    try {
      const allowed: Record<string, unknown> = {};
      if (req.body.name) allowed.name = req.body.name;
      if (req.body.graph) allowed.graph = req.body.graph;

      const project = await Project.findByIdAndUpdate(
        req.params.id,
        { $set: allowed },
        { new: true, runValidators: true }
      );
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json(project);
    } catch (err) {
      res.status(500).json({ error: "Failed to update project" });
    }
  }
);

// ─── DELETE /projects/:id ─────────────────────────────────────────────────────

router.delete(
  "/:id",
  [param("id").isMongoId()],
  async (req: Request, res: Response) => {
    if (!handleValidation(req, res)) return;
    try {
      const project = await Project.findByIdAndDelete(req.params.id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json({ message: "Project deleted" });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete project" });
    }
  }
);

export default router;
