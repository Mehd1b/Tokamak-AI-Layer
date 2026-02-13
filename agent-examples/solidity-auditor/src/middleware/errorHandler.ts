import type { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error(`[ERROR] ${err.message}`);

  if (err.message.includes('required') || err.message.includes('too short') || err.message.includes('does not appear')) {
    res.status(400).json({ error: err.message });
    return;
  }

  if (err.message.includes('not found') || err.message.includes('Unknown agent')) {
    res.status(404).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
}
