import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../app.js";
import { accessModeSchema, idSchema, nullableIdSchema, pageSizeSchema, parse, sortSchema } from "../contracts.js";
import { ApiError } from "../lib/errors.js";
import { formatBytes } from "../lib/format.js";
import { nodeResponse, sendNodeContent, userIdentityResponse } from "../http.js";
import { requireUser } from "../plugins/auth.js";

const listSchema = z.object({ parentId: nullableIdSchema.optional().default(null), cursor: z.string().max(2048).optional(), pageSize: pageSizeSchema, sort: sortSchema, search: z.string().trim().max(120).optional() });
const createFolderSchema = z.object({ parentId: nullableIdSchema.optional().default(null), name: z.string().max(255) });
const patchSchema = z.object({ name: z.string().max(255).optional(), parentId: nullableIdSchema.optional() }).refine((value) => value.name !== undefined || value.parentId !== undefined, "Provide a name or destination folder.");
const accessSchema = z.object({ accessMode: accessModeSchema });

export async function registerNodeRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/v1/nodes", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const query = parse(listSchema, request.query);
    const [result, storage] = await Promise.all([
      context.drive.list(user.uid, { parentId: query.parentId ?? null, cursor: query.cursor, pageSize: query.pageSize ?? 25, sort: query.sort ?? "date:new-first", search: query.search }),
      context.drive.getStorage(user.uid),
    ]);
    if (!storage) throw new ApiError(404, "STORAGE_NOT_FOUND", "Storage profile is unavailable.");
    const percentUsed = Math.min(100, Math.round((storage.storageUsedBytes / storage.storageLimitBytes) * 100));
    const items = await Promise.all(result.items.map(async (node) => {
      const shares = await context.drive.listShares(user.uid, node.id);
      const isShared = node.accessMode === "private" && shares.some((share) => share.mode === "recipient" && !share.revokedAt && (!share.expiresAt || share.expiresAt > new Date()));
      const uploadedBy = node.createdBy && node.createdBy !== node.ownerId
        ? userIdentityResponse((await context.repository.getUser(node.createdBy)) ?? { id: node.createdBy, username: null, avatarVersion: null })
        : null;
      return { ...nodeResponse(node), isShared, uploadedBy };
    }));
    return { items, nextCursor: result.nextCursor, breadcrumbs: result.breadcrumbs.map(nodeResponse), storage: { usedBytes: storage.storageUsedBytes, reservedBytes: storage.storageReservedBytes, limitBytes: storage.storageLimitBytes, usedDisplay: formatBytes(storage.storageUsedBytes), limitDisplay: formatBytes(storage.storageLimitBytes), percentUsed, isUnlimited: false, limitLabel: formatBytes(storage.storageLimitBytes) } };
  });

  app.post("/v1/folders", async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const body = parse(createFolderSchema, request.body);
    const node = await context.drive.createFolder(user.uid, body.parentId ?? null, body.name);
    return reply.code(201).send({ item: nodeResponse(node) });
  });

  app.get("/v1/nodes/:nodeId", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const { nodeId } = parse(z.object({ nodeId: idSchema }), request.params);
    const node = await context.drive.getNodeForOwner(user.uid, nodeId);
    if (!node) throw new ApiError(404, "NOT_FOUND", "The item does not exist.");
    return { item: nodeResponse(node) };
  });

  app.patch("/v1/nodes/:nodeId/access", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const { nodeId } = parse(z.object({ nodeId: idSchema }), request.params);
    const body = parse(accessSchema, request.body);
    return { item: nodeResponse(await context.drive.setNodeAccess(user.uid, nodeId, body.accessMode)) };
  });

  app.patch("/v1/nodes/:nodeId", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const { nodeId } = parse(z.object({ nodeId: idSchema }), request.params);
    const body = parse(patchSchema, request.body);
    return { item: nodeResponse(await context.drive.updateNode(user.uid, nodeId, body)) };
  });

  app.delete("/v1/nodes/:nodeId", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const { nodeId } = parse(z.object({ nodeId: idSchema }), request.params);
    const query = parse(z.object({ permanent: z.coerce.boolean().default(false) }), request.query);
    const permanent = query.permanent ?? false;
    const nodes = await context.drive.deleteNode(user.uid, nodeId, permanent);
    return { deleted: nodes.map((node) => node.id), permanent };
  });

  app.post("/v1/nodes/:nodeId/restore", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const { nodeId } = parse(z.object({ nodeId: idSchema }), request.params);
    return { item: nodeResponse(await context.drive.restoreNode(user.uid, nodeId)) };
  });

  async function getReadableNode(request: FastifyRequest) {
    const user = await requireUser(request, context.firebase.auth);
    const { nodeId } = parse(z.object({ nodeId: idSchema }), request.params);
    const node = await context.drive.getNode(nodeId);
    const access = node ? await context.drive.getRecipientAccess(user.uid, nodeId) : null;
    if (!node || !access) throw new ApiError(404, "NOT_FOUND", "The item does not exist.");
    return { node, access };
  }

  app.get("/v1/nodes/:nodeId/content", async (request, reply) => {
    const { node } = await getReadableNode(request);
    return sendNodeContent(request, reply, context.drive, node, false);
  });

  app.get("/v1/nodes/:nodeId/thumbnail", { config: { rateLimit: { max: 240, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { node } = await getReadableNode(request);
    const preview = await context.drive.streamPreview(node);
    if (!preview) return reply.code(204).send();
    return reply
      .header("cache-control", "private, max-age=86400")
      .header("content-type", preview.contentType)
      .header("x-content-type-options", "nosniff")
      .send(preview.stream);
  });

  app.get("/v1/nodes/:nodeId/download", async (request, reply) => {
    const { node } = await getReadableNode(request);
    return sendNodeContent(request, reply, context.drive, node, true);
  });

  app.get("/v1/storage", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const storage = await context.drive.getStorage(user.uid);
    if (!storage) throw new ApiError(404, "STORAGE_NOT_FOUND", "Storage profile is unavailable.");
    const percentUsed = Math.min(100, Math.round((storage.storageUsedBytes / storage.storageLimitBytes) * 100));
    return { usedBytes: storage.storageUsedBytes, reservedBytes: storage.storageReservedBytes, limitBytes: storage.storageLimitBytes, usedDisplay: formatBytes(storage.storageUsedBytes), limitDisplay: formatBytes(storage.storageLimitBytes), percentUsed, isUnlimited: false, limitLabel: formatBytes(storage.storageLimitBytes) };
  });

  app.put("/v1/nodes/:nodeId/favorite", async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const { nodeId } = parse(z.object({ nodeId: idSchema }), request.params);
    await context.drive.setFavorite(user.uid, nodeId, true);
    return reply.code(204).send();
  });

  app.delete("/v1/nodes/:nodeId/favorite", async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const { nodeId } = parse(z.object({ nodeId: idSchema }), request.params);
    await context.drive.setFavorite(user.uid, nodeId, false);
    return reply.code(204).send();
  });

  app.get("/v1/favorites", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const page = await context.drive.listFavorites(user.uid);
    return { items: page.items.map(nodeResponse), nextCursor: page.nextCursor };
  });

  app.get("/v1/shared", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const page = await context.drive.listShared(user.uid);
    return { items: await Promise.all(page.items.map(async (item) => ({ ...nodeResponse(item.node), sharedRole: item.role, sharedSource: item.source, shareId: item.shareId, owner: userIdentityResponse((await context.repository.getUser(item.node.ownerId)) ?? { id: item.node.ownerId, username: null, avatarVersion: null }), uploadedBy: item.node.createdBy && item.node.createdBy !== item.node.ownerId ? userIdentityResponse((await context.repository.getUser(item.node.createdBy)) ?? { id: item.node.createdBy, username: null, avatarVersion: null }) : null }))), nextCursor: page.nextCursor };
  });

  app.get("/v1/shared/:nodeId/children", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const { nodeId } = parse(z.object({ nodeId: idSchema }), request.params);
    const query = parse(listSchema, request.query);
    const node = await context.drive.getNode(nodeId);
    const access = node ? await context.drive.getRecipientAccess(user.uid, nodeId) : null;
    if (!node || node.kind !== "folder" || !access) throw new ApiError(404, "FOLDER_NOT_FOUND", "The shared folder is unavailable.");
    const page = await context.drive.list(node.ownerId, { parentId: nodeId, cursor: query.cursor, pageSize: query.pageSize ?? 25, sort: query.sort ?? "date:new-first", search: query.search });
    const owner = userIdentityResponse((await context.repository.getUser(node.ownerId)) ?? { id: node.ownerId, username: null, avatarVersion: null });
    return { items: await Promise.all(page.items.map(async (item) => ({ ...nodeResponse(item), sharedRole: access.role, owner, uploadedBy: item.createdBy && item.createdBy !== item.ownerId ? userIdentityResponse((await context.repository.getUser(item.createdBy)) ?? { id: item.createdBy, username: null, avatarVersion: null }) : null }))), nextCursor: page.nextCursor, breadcrumbs: page.breadcrumbs.map(nodeResponse), role: access.role };
  });

  app.get("/v1/users", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const { query } = parse(z.object({ query: z.string().trim().min(2).max(120) }), request.query);
    return { users: (await context.drive.findUsers(query.toLowerCase())).filter((candidate) => candidate.id !== user.uid).map(userIdentityResponse) };
  });

  app.get("/v1/trash", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const query = parse(z.object({ cursor: z.string().max(2048).optional(), pageSize: pageSizeSchema }), request.query);
    const page = await context.drive.listTrash(user.uid, query.cursor, query.pageSize);
    return { items: page.items.map(nodeResponse), nextCursor: page.nextCursor };
  });
}
