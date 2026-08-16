import { jwtVerify } from "jose";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../app.js";
import { ApiError } from "../lib/errors.js";
import { sendNodeContent } from "../http.js";

function relativePath(value: unknown) {
  if (typeof value !== "string") throw new ApiError(404, "NOT_FOUND", "The shared file is unavailable.");
  let decoded: string;
  try { decoded = value.split("/").map(decodeURIComponent).join("/"); } catch { throw new ApiError(404, "NOT_FOUND", "The shared file is unavailable."); }
  const parts = decoded.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === ".." || part.includes("\0"))) throw new ApiError(404, "NOT_FOUND", "The shared file is unavailable.");
  return parts.join("/");
}

async function legacyNode(context: AppContext, ownerId: string, wildcard: unknown) {
  const path = relativePath(wildcard);
  const node = await context.drive.getNodeByLegacyPath(ownerId, path);
  if (!node) throw new ApiError(404, "CONTENT_NOT_FOUND", "This shared file is unavailable.");
  return { node, path };
}

export async function registerLegacyShareRoutes(app: FastifyInstance, context: AppContext) {
  // Compatibility only. New links use /p/:publicId and /s/:token.
  app.get("/public/:ownerId/*", async (request, reply) => {
    const params = request.params as { ownerId: string; "*": string };
    const { node } = await legacyNode(context, params.ownerId, params["*"]);
    const publicShare = await context.drive.findPublicShare(node.id);
    if (!publicShare) throw new ApiError(404, "SHARE_NOT_FOUND", "This public link is unavailable.");
    const query = request.query as { download?: string } | undefined;
    return sendNodeContent(request, reply, context.drive, node, query?.download === "true");
  });

  app.get("/shared/:ownerId/*", async (request, reply) => {
    if (!context.config.legacyShareTokenSecret) throw new ApiError(410, "LEGACY_LINK_RETIRED", "This legacy private link is no longer available.");
    const params = request.params as { ownerId: string; "*": string };
    const { node, path } = await legacyNode(context, params.ownerId, params["*"]);
    const token = (request.query as { shareToken?: string } | undefined)?.shareToken;
    if (!token) throw new ApiError(401, "SHARE_TOKEN_REQUIRED", "This private link requires a token.");
    try {
      const result = await jwtVerify(token, new TextEncoder().encode(context.config.legacyShareTokenSecret), { algorithms: ["HS256"] });
      if (result.payload.path !== `${params.ownerId}/${path}`) throw new Error("path mismatch");
    } catch {
      throw new ApiError(401, "INVALID_SHARE_TOKEN", "This private link is invalid or expired.");
    }
    const query = request.query as { download?: string } | undefined;
    return sendNodeContent(request, reply, context.drive, node, query?.download === "true");
  });
}
