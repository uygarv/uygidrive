import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../app.js";
import { idSchema, parse } from "../contracts.js";
import { ApiError } from "../lib/errors.js";
import { hashToken, id, secretToken } from "../lib/ids.js";
import { nodeResponse, sendNodeContent } from "../http.js";
import { requireUser } from "../plugins/auth.js";

const createShareSchema = z.object({ mode: z.enum(["public", "link", "recipient"]), recipientId: idSchema.nullable().optional().default(null), expiresAt: z.string().datetime().nullable().optional().default(null) }).superRefine((value, context) => {
  if (value.mode === "recipient" && !value.recipientId) context.addIssue({ code: z.ZodIssueCode.custom, message: "A recipient is required for a recipient share." });
});

function shareResponse(share: { id: string; mode: string; publicId: string | null; recipientId: string | null; expiresAt: Date | null; revokedAt: Date | null }, webOrigin: string, rawToken?: string) {
  const url = share.mode === "public" && share.publicId ? `${webOrigin}/p/${share.publicId}` : share.mode === "link" && rawToken ? `${webOrigin}/s/${rawToken}` : null;
  return { id: share.id, mode: share.mode, recipientId: share.recipientId, expiresAt: share.expiresAt?.toISOString() ?? null, revokedAt: share.revokedAt?.toISOString() ?? null, url };
}

export async function registerShareRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/v1/nodes/:nodeId/shares", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const { nodeId } = parse(z.object({ nodeId: idSchema }), request.params);
    const shares = await context.drive.listShares(user.uid, nodeId);
    return { shares: shares.map((share) => shareResponse(share, context.config.webOrigins[0]!)) };
  });

  app.post("/v1/nodes/:nodeId/shares", async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const { nodeId } = parse(z.object({ nodeId: idSchema }), request.params);
    const body = parse(createShareSchema, request.body);
    const publicId = body.mode === "public" ? id("pub") : null;
    const rawToken = body.mode === "link" ? secretToken() : undefined;
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    const share = await context.drive.createShare({ id: id("shr"), nodeId, ownerId: user.uid, mode: body.mode, publicId, tokenHash: rawToken ? hashToken(rawToken) : null, recipientId: body.recipientId ?? null, expiresAt });
    return reply.code(201).send({ share: shareResponse(share, context.config.webOrigins[0]!, rawToken) });
  });

  app.delete("/v1/shares/:shareId", async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const { shareId } = parse(z.object({ shareId: idSchema }), request.params);
    await context.drive.revokeShare(user.uid, shareId);
    return reply.code(204).send();
  });

  app.get("/v1/public/:publicId", async (request) => {
    const { publicId } = parse(z.object({ publicId: idSchema }), request.params);
    const share = await context.drive.resolvePublicShare(publicId);
    if (!share || share.mode !== "public") throw new ApiError(404, "SHARE_NOT_FOUND", "This public link is unavailable.");
    const node = await context.drive.getNode(share.nodeId);
    if (!node || node.status !== "active") throw new ApiError(404, "CONTENT_NOT_FOUND", "This shared file is unavailable.");
    return { item: nodeResponse(node), share: { mode: "public", expiresAt: share.expiresAt?.toISOString() ?? null } };
  });

  app.get("/v1/public/:publicId/content", async (request, reply) => {
    const { publicId } = parse(z.object({ publicId: idSchema }), request.params);
    const share = await context.drive.resolvePublicShare(publicId);
    if (!share || share.mode !== "public") throw new ApiError(404, "SHARE_NOT_FOUND", "This public link is unavailable.");
    const node = await context.drive.getNode(share.nodeId);
    if (!node || node.status !== "active") throw new ApiError(404, "CONTENT_NOT_FOUND", "This shared file is unavailable.");
    return sendNodeContent(request, reply, context.drive, node, (request.query as { download?: string } | undefined)?.download === "true");
  });

  app.get("/v1/s/:token", async (request) => {
    const { token } = parse(z.object({ token: z.string().min(32).max(200) }), request.params);
    const share = await context.drive.resolveTokenShare(hashToken(token));
    if (!share || share.mode !== "link") throw new ApiError(404, "SHARE_NOT_FOUND", "This private link is unavailable.");
    const node = await context.drive.getNode(share.nodeId);
    if (!node || node.status !== "active") throw new ApiError(404, "CONTENT_NOT_FOUND", "This shared file is unavailable.");
    return { item: nodeResponse(node), share: { mode: "link", expiresAt: share.expiresAt?.toISOString() ?? null } };
  });

  app.get("/v1/s/:token/content", async (request, reply) => {
    const { token } = parse(z.object({ token: z.string().min(32).max(200) }), request.params);
    const share = await context.drive.resolveTokenShare(hashToken(token));
    if (!share || share.mode !== "link") throw new ApiError(404, "SHARE_NOT_FOUND", "This private link is unavailable.");
    const node = await context.drive.getNode(share.nodeId);
    if (!node || node.status !== "active") throw new ApiError(404, "CONTENT_NOT_FOUND", "This shared file is unavailable.");
    return sendNodeContent(request, reply, context.drive, node, (request.query as { download?: string } | undefined)?.download === "true");
  });
}
