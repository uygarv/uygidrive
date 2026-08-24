import type { DeviceTransferRecord, DeviceTransferSignal, DeviceTransferSignalType } from "../types.js";

export interface DeviceTransferRepository {
  create(input: Omit<DeviceTransferRecord, "createdAt" | "updatedAt" | "nextSignalSequence">): Promise<DeviceTransferRecord>;
  get(id: string): Promise<DeviceTransferRecord | null>;
  listForOwner(ownerId: string, limit?: number): Promise<DeviceTransferRecord[]>;
  findByManualCodeHash(codeHash: string): Promise<DeviceTransferRecord | null>;
  join(input: { id: string; ownerId?: string; invitationTokenHash?: string; manualCodeHash?: string; receiverTokenHash: string }): Promise<DeviceTransferRecord | null>;
  appendSignal(input: { transferId: string; recipient: "sender" | "receiver"; type: DeviceTransferSignalType; payload: Record<string, unknown> }): Promise<DeviceTransferSignal>;
  listSignals(transferId: string, recipient: "sender" | "receiver", after: number): Promise<DeviceTransferSignal[]>;
  setStatus(id: string, status: DeviceTransferRecord["status"]): Promise<DeviceTransferRecord | null>;
  purgeExpired(cutoff: Date, limit?: number): Promise<number>;
}
