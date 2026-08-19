import { Readable } from "node:stream";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../app.js";
import { idSchema, nullableIdSchema, parse } from "../contracts.js";
import { ApiError } from "../lib/errors.js";
import { nodeResponse } from "../http.js";
import { requireUser } from "../plugins/auth.js";
import { UPLOAD_CHUNK_BYTES } from "../services/storage-service.js";

const createUploadSchema = z.object({ parentId: nullableIdSchema.optional().default(null), name: z.string().max(255), contentType: z.string().max(255).nullable().optional().default(null), sizeBytes: z.coerce.number().int().min(0).max(100 * 1024 * 1024 * 1024) });
const contentRangePattern = /^bytes (\d+)-(\d+)\/(\d+)$/;

function parseContentRange(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const match = raw?.match(contentRangePattern);
  if (!match) throw new ApiError(422, "INVALID_CONTENT_RANGE", "Content-Range must describe a single byte range.");
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  if (![start, end, total].every(Number.isSafeInteger)) throw new ApiError(422, "INVALID_CONTENT_RANGE", "Content-Range is invalid.");
  return { start, end, total };
}

export async function registerUploadRoutes(app: FastifyInstance, context: AppContext) {
  app.post("/v1/uploads", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const body = parse(createUploadSchema, request.body);
    const upload = await context.drive.createUpload(user.uid, { parentId: body.parentId ?? null, name: body.name, contentType: body.contentType ?? null, sizeBytes: body.sizeBytes });
    return reply.code(201).send({ upload: { id: upload.id, nodeId: upload.nodeId, expiresAt: upload.expiresAt.toISOString() } });
  });

  app.get("/v1/uploads", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const uploads = await context.drive.listOpenUploads(user.uid);
    return { uploads: uploads.filter((upload) => ["pending", "streaming"].includes(upload.status)).map((upload) => ({ id: upload.id, parentId: upload.parentId, name: upload.name, contentType: upload.contentType, expectedBytes: upload.expectedBytes, receivedBytes: upload.receivedBytes, status: upload.status, expiresAt: upload.expiresAt.toISOString() })) };
  });

  // Leave room above the raw 16 MiB body for Fastify's request accounting.
  app.put("/v1/uploads/:uploadId/chunk", { bodyLimit: UPLOAD_CHUNK_BYTES + 1024 * 1024, config: { rateLimit: false } }, async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const { uploadId } = parse(z.object({ uploadId: idSchema }), request.params);
    const range = parseContentRange(request.headers["content-range"]);
    const contentLength = Number(request.headers["content-length"]);
    if (!Number.isSafeInteger(contentLength) || contentLength !== range.end - range.start + 1) throw new ApiError(422, "INVALID_CHUNK_LENGTH", "Content-Length does not match Content-Range.");
    const source = request.body;
    if (!source || typeof (source as Readable).pipe !== "function") throw new ApiError(415, "INVALID_UPLOAD_BODY", "Upload content must be a binary stream.");
    const result = await context.drive.receiveUploadChunk(user.uid, uploadId, source as Readable, range);
    return reply.code(result.item ? 201 : 200).send({ upload: { id: result.upload?.id ?? uploadId, status: result.upload?.status, expectedBytes: result.upload?.expectedBytes, receivedBytes: result.upload?.receivedBytes, expiresAt: result.upload?.expiresAt.toISOString() }, item: result.item ? nodeResponse(result.item) : null });
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
