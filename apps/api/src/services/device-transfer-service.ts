import { randomBytes } from "node:crypto";
import { ApiError } from "../lib/errors.js";
import { hashToken, id, secretToken } from "../lib/ids.js";
import type { DeviceTransferRecord, DeviceTransferSignalType } from "../types.js";
import type { DeviceTransferRepository } from "../repositories/device-transfer-repository.js";
import { CloudflareTurnService, type IceServer } from "./cloudflare-turn-service.js";

const TRANSFER_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;
const PAIRING_TTL_MS = 10 * 60 * 1_000;
const TRANSFER_TTL_MS = 8 * 60 * 60 * 1_000;
function manualCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function publicTransfer(transfer: DeviceTransferRecord) {
  return { id: transfer.id, source: transfer.source, name: transfer.name, contentType: transfer.contentType, sizeBytes: transfer.sizeBytes, status: transfer.status, pairingExpiresAt: transfer.pairingExpiresAt.toISOString(), expiresAt: transfer.expiresAt.toISOString() };
}

export class DeviceTransferService {
  constructor(private readonly repository: DeviceTransferRepository, private readonly turn: CloudflareTurnService) {}

  async create(ownerId: string, input: { source: "drive" | "local"; driveNodeId: string | null; name: string; contentType: string | null; sizeBytes: number }) {
    if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > TRANSFER_LIMIT_BYTES) throw new ApiError(422, "TRANSFER_SIZE_INVALID", "Device transfers support files up to 2 GB.");
    const transferId = id("dtr");
    const invitationToken = secretToken();
    const code = manualCode();
    const pairingExpiresAt = new Date(Date.now() + PAIRING_TTL_MS);
    const expiresAt = new Date(Date.now() + TRANSFER_TTL_MS);
    const transfer = await this.repository.create({
      id: transferId,
      ownerId,
      source: input.source,
      driveNodeId: input.driveNodeId,
      name: input.name,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      invitationTokenHash: hashToken(invitationToken),
      manualCodeHash: hashToken(code),
      receiverTokenHash: null,
      status: "created",
      pairingExpiresAt,
      expiresAt,
    });
    try {
      const iceServers = await this.turn.iceServers(`transfer:${transferId}:sender`);
      return { transfer: publicTransfer(transfer), invitation: `${transferId}.${invitationToken}`, code, iceServers };
    } catch (error) {
      await this.repository.setStatus(transferId, "failed");
      throw error;
    }
  }

  async joinWithCapability(input: { invitation?: string; code?: string; receiverToken: string }) {
    let candidate: DeviceTransferRecord | null = null;
    let joinInput: { id: string; invitationTokenHash?: string; manualCodeHash?: string; receiverTokenHash: string } | null = null;
    if (input.invitation) {
      const [idValue, token] = input.invitation.split(".");
      if (!idValue || !token) throw new ApiError(422, "INVALID_INVITATION", "The device invitation is invalid.");
      const invitationTokenHash = hashToken(token);
      candidate = await this.repository.get(idValue);
      joinInput = { id: idValue, invitationTokenHash, receiverTokenHash: hashToken(input.receiverToken) };
      if (!candidate || candidate.invitationTokenHash !== invitationTokenHash) candidate = null;
    } else if (input.code) {
      const normalizedCode = input.code.toUpperCase();
      const manualCodeHash = hashToken(normalizedCode);
      candidate = await this.repository.findByManualCodeHash(manualCodeHash);
      if (candidate) joinInput = { id: candidate.id, manualCodeHash, receiverTokenHash: hashToken(input.receiverToken) };
    }
    if (!candidate || !joinInput || candidate.pairingExpiresAt <= new Date() || candidate.receiverTokenHash || candidate.status !== "created") throw new ApiError(404, "TRANSFER_NOT_FOUND", "This transfer is unavailable, expired, or already in use.");
    const iceServers = await this.turn.iceServers(`transfer:${candidate.id}:receiver`);
    const transfer = await this.repository.join(joinInput);
    if (!transfer) throw new ApiError(404, "TRANSFER_NOT_FOUND", "This transfer is unavailable, expired, or already in use.");
    return { transfer: publicTransfer(transfer), receiverToken: input.receiverToken, iceServers };
  }

  async availableForOwner(ownerId: string) {
    const now = new Date();
    const transfers = await this.repository.listForOwner(ownerId);
    return transfers
      .filter((transfer) => transfer.status === "created" && !transfer.receiverTokenHash && transfer.pairingExpiresAt > now)
      .map(publicTransfer);
  }

  async joinOwnTransfer(input: { id: string; ownerId: string; receiverToken: string }) {
    const candidate = await this.repository.get(input.id);
    if (!candidate || candidate.ownerId !== input.ownerId || candidate.pairingExpiresAt <= new Date() || candidate.receiverTokenHash || candidate.status !== "created") throw new ApiError(404, "TRANSFER_NOT_FOUND", "This transfer is unavailable, expired, or already in use.");
    const iceServers = await this.turn.iceServers(`transfer:${candidate.id}:receiver`);
    const transfer = await this.repository.join({ id: candidate.id, ownerId: input.ownerId, receiverTokenHash: hashToken(input.receiverToken) });
    if (!transfer) throw new ApiError(404, "TRANSFER_NOT_FOUND", "This transfer is unavailable, expired, or already in use.");
    return { transfer: publicTransfer(transfer), receiverToken: input.receiverToken, iceServers };
  }

  async sender(idValue: string, ownerId: string) {
    const transfer = await this.repository.get(idValue);
    if (!transfer || transfer.ownerId !== ownerId || transfer.expiresAt <= new Date()) throw new ApiError(404, "TRANSFER_NOT_FOUND", "This transfer is unavailable.");
    return transfer;
  }

  async receiver(idValue: string, receiverToken: string) {
    const transfer = await this.repository.get(idValue);
    if (!transfer || !transfer.receiverTokenHash || transfer.receiverTokenHash !== hashToken(receiverToken) || transfer.expiresAt <= new Date()) throw new ApiError(404, "TRANSFER_NOT_FOUND", "This transfer is unavailable.");
    return transfer;
  }

  async signal(transfer: DeviceTransferRecord, actor: "sender" | "receiver", type: DeviceTransferSignalType, payload: Record<string, unknown>) {
    const recipient = actor === "sender" ? "receiver" : "sender";
    const signal = await this.repository.appendSignal({ transferId: transfer.id, recipient, type, payload });
    if (type === "reject") await this.repository.setStatus(transfer.id, "rejected");
    else if (type === "cancel") await this.repository.setStatus(transfer.id, "cancelled");
    else if (type === "complete") await this.repository.setStatus(transfer.id, "completed");
    // Connection progress is advisory and is delivered through the signal
    // stream. It must never change the transfer record used for authorization:
    // mobile browsers can briefly reconnect while ICE switches candidates.
    return signal;
  }

  signals(transfer: DeviceTransferRecord, actor: "sender" | "receiver", after: number) {
    return this.repository.listSignals(transfer.id, actor, after);
  }

  purgeExpired() { return this.repository.purgeExpired(new Date()); }

  static receiverToken() { return secretToken(); }
  static limitBytes() { return TRANSFER_LIMIT_BYTES; }
}
