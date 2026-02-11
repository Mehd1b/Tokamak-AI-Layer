import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { SnapshotIdParams, ErrorResponse } from "../schemas.js";

export async function snapshotRoutes(app: FastifyInstance, ctx: AppContext) {
  /**
   * GET /api/v1/snapshot/:id — Retrieve data snapshot for validation
   */
  app.get<{ Params: SnapshotIdParams }>("/api/v1/snapshot/:id", {
    schema: {
      params: SnapshotIdParams,
      response: {
        404: ErrorResponse,
      },
    },
    handler: async (req, reply) => {
      const snapshot = ctx.snapshotCache.get(req.params.id);
      if (!snapshot) {
        return reply.code(404).send({ error: "not_found", message: "Snapshot not found" });
      }

      return reply.send(snapshot);
    },
  });
}
