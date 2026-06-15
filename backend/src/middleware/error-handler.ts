import { Request, Response, NextFunction } from "express";

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error("[error]", err.message);
  const status = (err as { status?: number }).status ?? 500;
  res.status(status).json({
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
}
