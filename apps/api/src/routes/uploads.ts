import { Readable } from "node:stream";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../app.js";
import { idSchema, nullableIdSchema, parse } from "../contracts.js";
import { ApiError } from "../lib/errors.js";
import { nodeResponse } from "../http.js";
import { requireUser } from "../plugins/auth.js";

const createUploadSchema = z.object({ parentId: nullableIdSchema.optional().default(null), name: z.string().max(255), contentType: z.string().max(255).nullable().optional().default(null), sizeBytes: z.coerce.number().int().min(0).max(100 * 1024 * 1024 * 1024) });

export async function registerUploadRoutes(app: FastifyInstance, context: AppContext) {
  app.post("/v1/uploads", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const body = parse(createUploadSchema, request.body);
    const upload = await context.drive.createUpload(user.uid, { parentId: body.parentId ?? null, name: body.name, contentType: body.contentType ?? null, sizeBytes: body.sizeBytes });
    return reply.code(201).send({ upload: { id: upload.id, nodeId: upload.nodeId, expiresAt: upload.expiresAt.toISOString() } });
  });

  app.put("/v1/uploads/:uploadId/content", { bodyLimit: 100 * 1024 * 1024 * 1024, config: { rateLimit: false } }, async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const { uploadId } = parse(z.object({ uploadId: idSchema }), request.params);
    const contentType = typeof request.headers["x-upload-content-type"] === "string" ? request.headers["x-upload-content-type"].slice(0, 255) : null;
    const source = request.body;
    if (!source || typeof (source as Readable).pipe !== "function") throw new ApiError(415, "INVALID_UPLOAD_BODY", "Upload content must be a binary stream.");
    const node = await context.drive.receiveUpload(user.uid, uploadId, source as Readable, contentType);
    return reply.code(201).send({ item: nodeResponse(node) });
  });

  app.get("/v1/uploads/:uploadId", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const { uploadId } = parse(z.object({ uploadId: idSchema }), request.params);
    const upload = await context.drive.getUpload(user.uid, uploadId);
    if (!upload) throw new ApiError(404, "UPLOAD_NOT_FOUND", "The upload does not exist.");
    return { upload: { id: upload.id, nodeId: upload.nodeId, status: upload.status, expectedBytes: upload.expectedBytes, receivedBytes: upload.receivedBytes, expiresAt: upload.expiresAt.toISOString() } };
  });

  app.delete("/v1/uploads/:uploadId", async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const { uploadId } = parse(z.object({ uploadId: idSchema }), request.params);
    await context.drive.cancelUpload(user.uid, uploadId);
    return reply.code(204).send();
  });
}
