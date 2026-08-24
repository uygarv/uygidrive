import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../app.js";
import { idSchema, parse } from "../contracts.js";
import { ApiError } from "../lib/errors.js";
import { safeFileName } from "../lib/format.js";
import { requireUser } from "../plugins/auth.js";
import { DeviceTransferService } from "../services/device-transfer-service.js";
import type { DeviceTransferRecord, DeviceTransferSignalType } from "../types.js";

const localSourceSchema = z.object({ source: z.literal("local"), name: z.string().max(255), contentType: z.string().max(255).nullable().optional().default(null), sizeBytes: z.coerce.number().int().positive() });
const driveSourceSchema = z.object({ source: z.literal("drive"), nodeId: idSchema });
const createSchema = z.discriminatedUnion("source", [localSourceSchema, driveSourceSchema]);
const joinSchema = z.object({ invitation: z.string().min(20).max(512).optional(), code: z.string().trim().regex(/^[A-Za-z2-9]{8}$/).optional() }).refine((value) => Boolean(value.invitation || value.code), "Enter an invitation or pairing code.");
const signalSchema = z.object({ type: z.enum(["offer", "answer", "candidate", "candidates", "accept", "reject", "complete", "cancel", "status"]), payload: z.record(z.unknown()).default({}) });
const signalQuerySchema = z.object({ after: z.coerce.number().int().min(0).default(0) });

function receiverToken(request: FastifyRequest) {
  const value = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  return value?.trim() || null;
}

async function actorFor(request: FastifyRequest, context: AppContext, transferId: string): Promise<{ actor: "sender" | "receiver"; transfer: DeviceTransferRecord }> {
  const capability = receiverToken(request);
  if (capability) return { actor: "receiver", transfer: await context.deviceTransfers.receiver(transferId, capability) };
  const user = await requireUser(request, context.firebase.auth);
  return { actor: "sender", transfer: await context.deviceTransfers.sender(transferId, user.uid) };
}

function transferResponse(transfer: DeviceTransferRecord) {
  return { id: transfer.id, source: transfer.source, name: transfer.name, contentType: transfer.contentType, sizeBytes: transfer.sizeBytes, status: transfer.status, pairingExpiresAt: transfer.pairingExpiresAt.toISOString(), expiresAt: transfer.expiresAt.toISOString() };
}

export async function registerDeviceTransferRoutes(app: FastifyInstance, context: AppContext) {
  app.post("/v1/device-transfers", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (request, reply) => {
    const user = await requireUser(request, context.firebase.auth);
    const body = parse(createSchema, request.body);
    let input: { source: "drive" | "local"; driveNodeId: string | null; name: string; contentType: string | null; sizeBytes: number };
    if (body.source === "drive") {
      const node = await context.drive.getNodeForOwner(user.uid, body.nodeId);
      if (!node || node.kind !== "file") throw new ApiError(404, "FILE_NOT_FOUND", "Choose an active file from My Drive.");
      input = { source: "drive", driveNodeId: node.id, name: node.name, contentType: node.contentType, sizeBytes: node.sizeBytes };
    } else {
      const name = safeFileName(body.name);
      if (!name) throw new ApiError(422, "INVALID_NAME", "Choose a file name without slashes or control characters.");
      input = { source: "local", driveNodeId: null, name, contentType: body.contentType ?? null, sizeBytes: body.sizeBytes };
    }
    const result = await context.deviceTransfers.create(user.uid, input);
    return reply.code(201).send({ transfer: result.transfer, invitation: result.invitation, invitationUrl: `${context.config.webOrigins[0]}/receive?invite=${encodeURIComponent(result.invitation)}`, code: result.code, iceServers: result.iceServers });
  });

  app.post("/v1/device-transfers/join", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = parse(joinSchema, request.body);
    const receiverTokenValue = DeviceTransferService.receiverToken();
    const result = await context.deviceTransfers.joinWithCapability({ ...body, receiverToken: receiverTokenValue });
    return reply.code(201).send(result);
  });

  app.get("/v1/device-transfers/available", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    return { transfers: await context.deviceTransfers.availableForOwner(user.uid) };
  });

  app.post("/v1/device-transfers/:transferId/join-own", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { transferId } = parse(z.object({ transferId: idSchema }), request.params);
    const user = await requireUser(request, context.firebase.auth);
    const result = await context.deviceTransfers.joinOwnTransfer({ id: transferId, ownerId: user.uid, receiverToken: DeviceTransferService.receiverToken() });
    return reply.code(201).send(result);
  });

  app.get("/v1/device-transfers/:transferId", async (request) => {
    const { transferId } = parse(z.object({ transferId: idSchema }), request.params);
    const { transfer } = await actorFor(request, context, transferId);
    return { transfer: transferResponse(transfer) };
  });

  app.get("/v1/device-transfers/:transferId/signals", async (request) => {
    const { transferId } = parse(z.object({ transferId: idSchema }), request.params);
    const query = parse(signalQuerySchema, request.query);
    const { transfer, actor } = await actorFor(request, context, transferId);
    const signals = await context.deviceTransfers.signals(transfer, actor, query.after ?? 0);
    return { signals: signals.map((signal) => ({ id: signal.id, sequence: signal.sequence, type: signal.type, payload: signal.payload, createdAt: signal.createdAt.toISOString() })) };
  });

  app.post("/v1/device-transfers/:transferId/signals", { config: { rateLimit: { max: 240, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { transferId } = parse(z.object({ transferId: idSchema }), request.params);
    const body = parse(signalSchema, request.body);
    const payload = body.payload ?? {};
    if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 32 * 1024) throw new ApiError(422, "SIGNAL_TOO_LARGE", "The transfer signal is too large.");
    const { transfer, actor } = await actorFor(request, context, transferId);
    const signal = await context.deviceTransfers.signal(transfer, actor, body.type as DeviceTransferSignalType, payload);
    return reply.code(201).send({ signal: { id: signal.id, sequence: signal.sequence } });
  });
}
