import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../app.js";
import { ApiError } from "../lib/errors.js";

function tokensMatch(received: string | undefined, expected: string) {
  if (!received) return false;
  const actual = Buffer.from(received);
  const secret = Buffer.from(expected);
  return actual.length === secret.length && timingSafeEqual(actual, secret);
}

export async function registerMaintenanceRoutes(app: FastifyInstance, context: AppContext) {
  app.post("/internal/maintenance/purge-trash", async (request) => {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!context.config.maintenanceToken || !tokensMatch(token, context.config.maintenanceToken)) {
      throw new ApiError(404, "NOT_FOUND", "The requested resource does not exist.");
    }
    const result = await context.drive.purgeExpiredTrash(context.config.trashRetentionDays);
    return { ...result, cutoff: result.cutoff.toISOString() };
  });
}
