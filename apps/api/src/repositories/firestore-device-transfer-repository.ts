import { type DocumentData, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
import { ApiError } from "../lib/errors.js";
import type { DeviceTransferRecord, DeviceTransferSignal, DeviceTransferSignalType } from "../types.js";
import type { DeviceTransferRepository } from "./device-transfer-repository.js";

const TRANSFERS = "deviceTransfers";

function toDate(value: unknown): Date {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate();
  return value instanceof Date ? value : new Date(0);
}

function transferFrom(snapshot: DocumentSnapshot<DocumentData>): DeviceTransferRecord {
  const data = snapshot.data();
  if (!snapshot.exists || !data) throw new ApiError(404, "TRANSFER_NOT_FOUND", "This transfer is unavailable.");
  return {
    id: snapshot.id,
    ownerId: String(data.ownerId),
    source: data.source === "drive" ? "drive" : "local",
    driveNodeId: data.driveNodeId ? String(data.driveNodeId) : null,
    name: String(data.name),
    contentType: data.contentType ? String(data.contentType) : null,
    sizeBytes: Number(data.sizeBytes),
    invitationTokenHash: String(data.invitationTokenHash),
    manualCodeHash: String(data.manualCodeHash),
    receiverTokenHash: data.receiverTokenHash ? String(data.receiverTokenHash) : null,
    status: data.status,
    // Existing short-lived transfer records used `expiresAt` for both values.
    // They remain safely expired, while new records keep a longer transfer TTL.
    pairingExpiresAt: data.pairingExpiresAt ? toDate(data.pairingExpiresAt) : toDate(data.expiresAt),
    expiresAt: toDate(data.expiresAt),
    nextSignalSequence: Number(data.nextSignalSequence ?? 0),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function signalFrom(snapshot: DocumentSnapshot<DocumentData>): DeviceTransferSignal {
  const data = snapshot.data()!;
  return { id: snapshot.id, sequence: Number(data.sequence), recipient: data.recipient === "sender" ? "sender" : "receiver", type: data.type as DeviceTransferSignalType, payload: data.payload && typeof data.payload === "object" ? data.payload as Record<string, unknown> : {}, createdAt: toDate(data.createdAt) };
}

export class FirestoreDeviceTransferRepository implements DeviceTransferRepository {
  constructor(private readonly firestore: Firestore) {}

  private ref(id: string) { return this.firestore.collection(TRANSFERS).doc(id); }
  private signals(id: string) { return this.ref(id).collection("signals"); }

  async create(input: Omit<DeviceTransferRecord, "createdAt" | "updatedAt" | "nextSignalSequence">) {
    const now = new Date();
    await this.ref(input.id).create({ ...input, nextSignalSequence: 0, createdAt: now, updatedAt: now });
    return transferFrom(await this.ref(input.id).get());
  }

  async get(id: string) {
    const snapshot = await this.ref(id).get();
    return snapshot.exists ? transferFrom(snapshot) : null;
  }

  async listForOwner(ownerId: string, limit = 50) {
    const snapshot = await this.firestore.collection(TRANSFERS).where("ownerId", "==", ownerId).limit(limit).get();
    return snapshot.docs.map(transferFrom).sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  }

  async findByManualCodeHash(manualCodeHash: string) {
    const result = await this.firestore.collection(TRANSFERS).where("manualCodeHash", "==", manualCodeHash).limit(1).get();
    return result.empty ? null : transferFrom(result.docs[0]!);
  }

  async join(input: { id: string; ownerId?: string; invitationTokenHash?: string; manualCodeHash?: string; receiverTokenHash: string }) {
    const ref = this.ref(input.id);
    let result: DeviceTransferRecord | null = null;
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return;
      const transfer = transferFrom(snapshot);
      const invitationMatches = input.invitationTokenHash && transfer.invitationTokenHash === input.invitationTokenHash;
      const codeMatches = input.manualCodeHash && transfer.manualCodeHash === input.manualCodeHash;
      const ownerMatches = input.ownerId && transfer.ownerId === input.ownerId;
      if (!invitationMatches && !codeMatches && !ownerMatches) return;
      if (transfer.pairingExpiresAt <= new Date() || transfer.receiverTokenHash || transfer.status !== "created") return;
      const now = new Date();
      transaction.update(ref, { receiverTokenHash: input.receiverTokenHash, status: "joined", updatedAt: now });
      result = { ...transfer, receiverTokenHash: input.receiverTokenHash, status: "joined", updatedAt: now };
    });
    return result;
  }

  async appendSignal(input: { transferId: string; recipient: "sender" | "receiver"; type: DeviceTransferSignalType; payload: Record<string, unknown> }) {
    const transferRef = this.ref(input.transferId);
    const signalRef = this.signals(input.transferId).doc();
    let result: DeviceTransferSignal | null = null;
    await this.firestore.runTransaction(async (transaction) => {
      const transfer = transferFrom(await transaction.get(transferRef));
      if (transfer.expiresAt <= new Date() || ["cancelled", "completed", "rejected", "failed", "expired"].includes(transfer.status)) throw new ApiError(409, "TRANSFER_UNAVAILABLE", "This transfer is no longer available.");
      const now = new Date();
      const sequence = transfer.nextSignalSequence + 1;
      transaction.update(transferRef, { nextSignalSequence: sequence, updatedAt: now });
      transaction.set(signalRef, { sequence, recipient: input.recipient, type: input.type, payload: input.payload, createdAt: now });
      result = { id: signalRef.id, sequence, recipient: input.recipient, type: input.type, payload: input.payload, createdAt: now };
    });
    return result!;
  }

  async listSignals(transferId: string, recipient: "sender" | "receiver", after: number) {
    const snapshot = await this.signals(transferId).where("sequence", ">", after).orderBy("sequence", "asc").limit(100).get();
    return snapshot.docs.map(signalFrom).filter((signal) => signal.recipient === recipient);
  }

  async setStatus(id: string, status: DeviceTransferRecord["status"]) {
    const ref = this.ref(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return null;
    await ref.update({ status, updatedAt: new Date() });
    return transferFrom(await ref.get());
  }

  async purgeExpired(cutoff: Date, limit = 100) {
    const snapshot = await this.firestore.collection(TRANSFERS).where("expiresAt", "<=", cutoff).limit(limit).get();
    let deleted = 0;
    for (const transfer of snapshot.docs) {
      const signals = await transfer.ref.collection("signals").get();
      const batch = this.firestore.batch();
      signals.docs.forEach((signal) => batch.delete(signal.ref));
      batch.delete(transfer.ref);
      await batch.commit();
      deleted += 1;
    }
    return deleted;
  }
}
