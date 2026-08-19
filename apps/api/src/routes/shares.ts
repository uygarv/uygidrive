import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../app.js";
import { createShareSchema, idSchema, parse, revokePrivateLinksResponseSchema } from "../contracts.js";
import { ApiError } from "../lib/errors.js";
import { hashToken, id, secretToken } from "../lib/ids.js";
import { nodeResponse, sendNodeContent, userIdentityResponse } from "../http.js";
import { requireUser } from "../plugins/auth.js";

async function isWithinShare(context: AppContext, nodeId: string, rootId: string) {
  const seen = new Set<string>();
  let node = await context.drive.getNode(nodeId);
  while (node && !seen.has(node.id)) {
    if (node.id === rootId) return true;
    seen.add(node.id);
    node = node.parentId ? await context.drive.getNode(node.parentId) : null;
  }
  return false;
}

function shareResponse(share: { id: string; mode: string; linkTarget: "preview" | "content"; publicId: string | null; recipientId: string | null; role: "viewer" | "editor" | null; expiresAt: Date | null; revokedAt: Date | null }, webOrigin: string, rawToken?: string) {
  const suffix = share.linkTarget === "content" ? "/content" : "";
  const url = share.mode === "public" && share.publicId ? `${webOrigin}/p/${share.publicId}${suffix}` : share.mode === "link" && rawToken ? `${webOrigin}/s/${rawToken}${suffix}` : null;
  return { id: share.id, mode: share.mode, linkTarget: share.linkTarget, recipientId: share.recipientId, role: share.role, expiresAt: share.expiresAt?.toISOString() ?? null, revokedAt: share.revokedAt?.toISOString() ?? null, url };
}

export async function registerShareRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/v1/nodes/:nodeId/shares", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const { nodeId } = parse(z.object({ nodeId: idSchema }), request.params);
    const shares = await context.drive.listShares(user.uid, nodeId);
    return { shares: await Promise.all(shares.map(async (share) => ({ ...shareResponse(share, context.config.webOrigins[0]!), recipient: share.recipientId ? userIdentityResponse((await context.repository.getUser(share.recipientId)) ?? { id: share.recipientId, username: null, avatarVersion: null }) : null }))) };
  });

  app.post("/v1/nodes/:nodeId/shares", async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const { nodeId } = parse(z.object({ nodeId: idSchema }), request.params);
    const body = parse(createShareSchema, request.body);
    if (body.mode === "recipient" && body.recipientId === user.uid) {
      throw new ApiError(422, "SELF_SHARE_NOT_ALLOWED", "You can’t share an item with yourself.");
    }
    const publicId = body.mode === "public" ? id("pub") : null;
    const rawToken = body.mode === "link" ? secretToken() : undefined;
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    const share = await context.drive.createShare({ id: id("shr"), nodeId, ownerId: user.uid, mode: body.mode, linkTarget: body.linkTarget ?? "preview", publicId, tokenHash: rawToken ? hashToken(rawToken) : null, recipientId: body.recipientId ?? null, role: body.role ?? null, expiresAt });
    return reply.code(201).send({ share: shareResponse(share, context.config.webOrigins[0]!, rawToken) });
  });

  app.delete("/v1/shares/:shareId", async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const { shareId } = parse(z.object({ shareId: idSchema }), request.params);
    await context.drive.revokeShare(user.uid, shareId);
    return reply.code(204).send();
  });

  app.delete("/v1/nodes/:nodeId/private-links", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const { nodeId } = parse(z.object({ nodeId: idSchema }), request.params);
    return parse(revokePrivateLinksResponseSchema, { revoked: await context.drive.revokePrivateLinks(user.uid, nodeId) });
  });

  app.patch("/v1/shares/:shareId", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const { shareId } = parse(z.object({ shareId: idSchema }), request.params);
    const { role } = parse(z.object({ role: z.enum(["viewer", "editor"]) }), request.body);
    const share = await context.drive.updateShareRole(user.uid, shareId, role);
    return { share: shareResponse(share, context.config.webOrigins[0]!) };
  });

  app.get("/v1/public/:publicId", async (request) => {
    const { publicId } = parse(z.object({ publicId: idSchema }), request.params);
    const share = await context.drive.resolvePublicShare(publicId);
    if (!share || share.mode !== "public") throw new ApiError(404, "SHARE_NOT_FOUND", "This public link is unavailable.");
    const node = await context.drive.getNode(share.nodeId);
    if (!node || node.status !== "active" || node.accessMode !== "public") throw new ApiError(404, "CONTENT_NOT_FOUND", "This shared file is unavailable.");
    return { item: nodeResponse(node), share: { mode: "public", expiresAt: share.expiresAt?.toISOString() ?? null } };
  });

  app.get("/v1/public/:publicId/content", async (request, reply) => {
    const { publicId } = parse(z.object({ publicId: idSchema }), request.params);
    const share = await context.drive.resolvePublicShare(publicId);
    if (!share || share.mode !== "public") throw new ApiError(404, "SHARE_NOT_FOUND", "This public link is unavailable.");
    const node = await context.drive.getNode(share.nodeId);
    if (!node || node.status !== "active" || node.accessMode !== "public") throw new ApiError(404, "CONTENT_NOT_FOUND", "This shared file is unavailable.");
    return sendNodeContent(request, reply, context.drive, node, (request.query as { download?: string } | undefined)?.download === "true");
  });

  app.get("/v1/public/:publicId/nodes/:nodeId/content", async (request, reply) => {
    const { publicId, nodeId } = parse(z.object({ publicId: idSchema, nodeId: idSchema }), request.params);
    const share = await context.drive.resolvePublicShare(publicId);
    const root = share ? await context.drive.getNode(share.nodeId) : null;
    const node = await context.drive.getNode(nodeId);
    if (!share || !root || root.kind !== "folder" || root.accessMode !== "public" || !node || node.kind !== "file" || node.status !== "active" || !await isWithinShare(context, node.id, root.id)) throw new ApiError(404, "CONTENT_NOT_FOUND", "This shared file is unavailable.");
    return sendNodeContent(request, reply, context.drive, node, (request.query as { download?: string } | undefined)?.download === "true");
  });

  app.get("/v1/public/:publicId/children", async (request) => {
    const { publicId } = parse(z.object({ publicId: idSchema }), request.params);
    const share = await context.drive.resolvePublicShare(publicId);
    const root = share ? await context.drive.getNode(share.nodeId) : null;
    if (!share || !root || root.kind !== "folder" || root.accessMode !== "public") throw new ApiError(404, "SHARE_NOT_FOUND", "This public folder is unavailable.");
    const query = parse(z.object({ parentId: idSchema.optional() }), request.query);
    const parentId = query.parentId ?? root.id;
    if (!await isWithinShare(context, parentId, root.id)) throw new ApiError(404, "NOT_FOUND", "This folder is unavailable.");
    const page = await context.drive.list(root.ownerId, { parentId, pageSize: 100, sort: "date:new-first" });
    return { items: page.items.map(nodeResponse) };
  });

  app.get("/v1/s/:token", async (request) => {
    const { token } = parse(z.object({ token: z.string().min(32).max(200) }), request.params);
    const share = await context.drive.resolveTokenShare(hashToken(token));
    if (!share || share.mode !== "link") throw new ApiError(404, "SHARE_NOT_FOUND", "This private link is unavailable.");
    const node = await context.drive.getNode(share.nodeId);
    if (!node || node.status !== "active") throw new ApiError(404, "CONTENT_NOT_FOUND", "This shared file is unavailable.");
    return { item: nodeResponse(node), share: { mode: "link", expiresAt: share.expiresAt?.toISOString() ?? null } };
  });

  app.post("/v1/public/:publicId/open", async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const { publicId } = parse(z.object({ publicId: idSchema }), request.params);
    const share = await context.drive.resolvePublicShare(publicId);
    if (!share || share.mode !== "public") throw new ApiError(404, "SHARE_NOT_FOUND", "This public link is unavailable.");
    const node = await context.drive.getNode(share.nodeId);
    if (!node || node.status !== "active" || node.accessMode !== "public") throw new ApiError(404, "CONTENT_NOT_FOUND", "This shared file is unavailable.");
    await context.drive.recordSharedOpen({ userId: user.uid, shareId: share.id, nodeId: node.id, source: "public-link" });
    return reply.code(204).send();
  });

  app.post("/v1/s/:token/open", async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const { token } = parse(z.object({ token: z.string().min(32).max(200) }), request.params);
    const share = await context.drive.resolveTokenShare(hashToken(token));
    if (!share || share.mode !== "link") throw new ApiError(404, "SHARE_NOT_FOUND", "This private link is unavailable.");
    await context.drive.recordSharedOpen({ userId: user.uid, shareId: share.id, nodeId: share.nodeId, source: "private-link" });
    return reply.code(204).send();
  });

  app.get("/v1/s/:token/content", async (request, reply) => {
    const { token } = parse(z.object({ token: z.string().min(32).max(200) }), request.params);
    const share = await context.drive.resolveTokenShare(hashToken(token));
    if (!share || share.mode !== "link") throw new ApiError(404, "SHARE_NOT_FOUND", "This private link is unavailable.");
    const node = await context.drive.getNode(share.nodeId);
    if (!node || node.status !== "active") throw new ApiError(404, "CONTENT_NOT_FOUND", "This shared file is unavailable.");
    return sendNodeContent(request, reply, context.drive, node, (request.query as { download?: string } | undefined)?.download === "true");
  });

  app.get("/v1/s/:token/nodes/:nodeId/content", async (request, reply) => {
    const { token, nodeId } = parse(z.object({ token: z.string().min(32).max(200), nodeId: idSchema }), request.params);
    const share = await context.drive.resolveTokenShare(hashToken(token));
    const root = share ? await context.drive.getNode(share.nodeId) : null;
    const node = await context.drive.getNode(nodeId);
    if (!share || !root || root.kind !== "folder" || !node || node.kind !== "file" || node.status !== "active" || !await isWithinShare(context, node.id, root.id)) throw new ApiError(404, "CONTENT_NOT_FOUND", "This shared file is unavailable.");
    return sendNodeContent(request, reply, context.drive, node, (request.query as { download?: string } | undefined)?.download === "true");
  });

  app.get("/v1/s/:token/children", async (request) => {
    const { token } = parse(z.object({ token: z.string().min(32).max(200) }), request.params);
    const share = await context.drive.resolveTokenShare(hashToken(token));
    const root = share ? await context.drive.getNode(share.nodeId) : null;
    if (!share || !root || root.kind !== "folder") throw new ApiError(404, "SHARE_NOT_FOUND", "This private folder is unavailable.");
    const query = parse(z.object({ parentId: idSchema.optional() }), request.query);
    const parentId = query.parentId ?? root.id;
    if (!await isWithinShare(context, parentId, root.id)) throw new ApiError(404, "NOT_FOUND", "This folder is unavailable.");
    const page = await context.drive.list(root.ownerId, { parentId, pageSize: 100, sort: "date:new-first" });
    return { items: page.items.map(nodeResponse) };
  });
}
