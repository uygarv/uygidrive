import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../app.js";
import { idSchema, nullableIdSchema, pageSizeSchema, parse, sortSchema } from "../contracts.js";
import { ApiError } from "../lib/errors.js";
import { formatBytes } from "../lib/format.js";
import { nodeResponse, sendNodeContent } from "../http.js";
import { requireUser } from "../plugins/auth.js";

const listSchema = z.object({ parentId: nullableIdSchema.optional().default(null), cursor: z.string().max(2048).optional(), pageSize: pageSizeSchema, sort: sortSchema, search: z.string().trim().max(120).optional() });
const createFolderSchema = z.object({ parentId: nullableIdSchema.optional().default(null), name: z.string().max(255) });
const patchSchema = z.object({ name: z.string().max(255).optional(), parentId: nullableIdSchema.optional() }).refine((value) => value.name !== undefined || value.parentId !== undefined, "Provide a name or destination folder.");

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
    return { items: result.items.map(nodeResponse), nextCursor: result.nextCursor, breadcrumbs: result.breadcrumbs.map(nodeResponse), storage: { usedBytes: storage.storageUsedBytes, reservedBytes: storage.storageReservedBytes, limitBytes: storage.storageLimitBytes, usedDisplay: formatBytes(storage.storageUsedBytes), limitDisplay: formatBytes(storage.storageLimitBytes), percentUsed, isUnlimited: false, limitLabel: formatBytes(storage.storageLimitBytes) } };
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

  app.get("/v1/nodes/:nodeId/content", async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const { nodeId } = parse(z.object({ nodeId: idSchema }), request.params);
    const node = await context.drive.getNodeForOwner(user.uid, nodeId);
    if (!node) throw new ApiError(404, "NOT_FOUND", "The file does not exist.");
    return sendNodeContent(request, reply, context.drive, node, false);
  });

  app.get("/v1/nodes/:nodeId/thumbnail", { config: { rateLimit: { max: 240, timeWindow: "1 minute" } } }, async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const { nodeId } = parse(z.object({ nodeId: idSchema }), request.params);
    const node = await context.drive.getNodeForOwner(user.uid, nodeId);
    if (!node) throw new ApiError(404, "NOT_FOUND", "The item does not exist.");
    const preview = await context.drive.streamPreview(node);
    if (!preview) return reply.code(204).send();
    return reply
      .header("cache-control", "private, max-age=86400")
      .header("content-type", preview.contentType)
      .header("x-content-type-options", "nosniff")
      .send(preview.stream);
  });

  app.get("/v1/nodes/:nodeId/download", async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const { nodeId } = parse(z.object({ nodeId: idSchema }), request.params);
    const node = await context.drive.getNodeForOwner(user.uid, nodeId);
    if (!node) throw new ApiError(404, "NOT_FOUND", "The file does not exist.");
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
    return { items: page.items.map(nodeResponse), nextCursor: page.nextCursor };
  });

  app.get("/v1/trash", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const query = parse(z.object({ cursor: z.string().max(2048).optional(), pageSize: pageSizeSchema }), request.query);
    const page = await context.drive.listTrash(user.uid, query.cursor, query.pageSize);
    return { items: page.items.map(nodeResponse), nextCursor: page.nextCursor };
  });
}
