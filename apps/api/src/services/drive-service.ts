import { ApiError } from "../lib/errors.js";
import { id } from "../lib/ids.js";
import { safeFileName } from "../lib/format.js";
import type { NodeRecord, UploadRecord } from "../types.js";
import type { DriveRepository, ListNodesInput } from "../repositories/drive-repository.js";
import { StorageService, UPLOAD_CHUNK_ALIGNMENT, UPLOAD_CHUNK_BYTES } from "./storage-service.js";

export class DriveService {
  constructor(private readonly repository: DriveRepository, private readonly storage: StorageService, private readonly uploadIntentTtlMinutes: number) {}

  async list(ownerId: string, input: Omit<ListNodesInput, "ownerId">) {
    const [page, breadcrumbs] = await Promise.all([
      this.repository.listNodes({ ...input, ownerId }),
      this.repository.listBreadcrumbs(ownerId, input.parentId),
    ]);
    return { ...page, breadcrumbs };
  }

  async createFolder(ownerId: string, parentId: string | null, rawName: string) {
    const name = safeFileName(rawName);
    if (!name) throw new ApiError(422, "INVALID_NAME", "Choose a name without slashes or control characters.");
    return this.repository.createFolder({ id: id("fld"), ownerId, parentId, name });
  }

  async updateNode(ownerId: string, nodeId: string, input: { name?: string; parentId?: string | null }) {
    let name: string | undefined;
    if (input.name !== undefined) {
      const validatedName = safeFileName(input.name);
      if (!validatedName) throw new ApiError(422, "INVALID_NAME", "Choose a name without slashes or control characters.");
      name = validatedName;
    }
    return this.repository.updateNode({ ownerId, nodeId, name, parentId: input.parentId });
  }

  async deleteNode(ownerId: string, nodeId: string, permanent: boolean) {
    if (!permanent) return this.repository.trashNode(ownerId, nodeId);
    const node = await this.repository.getNodeForOwner(ownerId, nodeId, ["trashed"]);
    if (!node) throw new ApiError(404, "NOT_FOUND", "The item does not exist in Trash.");
    const nodes = await this.repository.permanentlyDeleteNodes(ownerId, nodeId);
    await Promise.all(nodes.filter((node) => node.kind === "file").map((node) => this.storage.delete(node)));
    await this.repository.finalizePermanentDelete(ownerId, nodes);
    return nodes;
  }

  restoreNode(ownerId: string, nodeId: string) { return this.repository.restoreNode(ownerId, nodeId); }

  async purgeExpiredTrash(retentionDays: number, batchSize = 100) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1_000);
    const candidates = await this.repository.listExpiredTrash(cutoff, batchSize);
    const candidateIds = new Set(candidates.map((node) => node.id));
    const roots = candidates.filter((node) => !node.parentId || !candidateIds.has(node.parentId));
    let deletedItems = 0;

    for (const root of roots) {
      const nodes = await this.repository.permanentlyDeleteNodes(root.ownerId, root.id);
      await Promise.all(nodes.filter((node) => node.kind === "file").map((node) => this.storage.delete(node)));
      await this.repository.finalizePermanentDelete(root.ownerId, nodes);
      deletedItems += nodes.length;
    }

    return { cutoff, candidates: candidates.length, deletedItems };
  }

  async createUpload(ownerId: string, input: { parentId: string | null; name: string; contentType: string | null; sizeBytes: number }) {
    const name = safeFileName(input.name);
    if (!name) throw new ApiError(422, "INVALID_NAME", "Choose a name without slashes or control characters.");
    if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0) throw new ApiError(422, "INVALID_SIZE", "File size is invalid.");
    const nodeId = id("fil");
    const uploadId = id("upl");
    const storageKey = `objects/${ownerId}/${nodeId}/original`;
    const resumableSessionUri = await this.storage.createResumableUpload({ storageKey, contentType: input.contentType, ownerId, nodeId });
    try {
      return await this.repository.createUpload({
      id: uploadId,
      ownerId,
      parentId: input.parentId,
      nodeId,
      name,
      contentType: input.contentType,
      expectedBytes: input.sizeBytes,
      storageKey,
      resumableSessionUri,
      expiresAt: new Date(Date.now() + this.uploadIntentTtlMinutes * 60_000),
      });
    } catch (error) {
      await this.storage.cancelResumableUpload({ resumableSessionUri } as UploadRecord).catch(() => undefined);
      throw error;
    }
  }

  async receiveUploadChunk(ownerId: string, uploadId: string, source: import("node:stream").Readable, range: { start: number; end: number; total: number }) {
    const upload = await this.repository.markUploadStreaming(ownerId, uploadId);
    if (range.total !== upload.expectedBytes || range.start < 0 || range.end < range.start || range.end >= range.total) throw new ApiError(422, "INVALID_CONTENT_RANGE", "The upload chunk range is invalid.");
    const chunkBytes = range.end - range.start + 1;
    const isFinalChunk = range.end === range.total - 1;
    if (range.start !== upload.receivedBytes) {
      const progress = await this.storage.getResumableProgress(upload);
      await this.repository.updateUploadProgress(ownerId, uploadId, progress.receivedBytes);
      throw new ApiError(409, "UPLOAD_OFFSET_MISMATCH", "The upload position has changed. Resume from the reported receivedBytes.", { receivedBytes: progress.receivedBytes });
    }
    if ((!isFinalChunk && (chunkBytes !== UPLOAD_CHUNK_BYTES || chunkBytes % UPLOAD_CHUNK_ALIGNMENT !== 0)) || (isFinalChunk && chunkBytes > UPLOAD_CHUNK_BYTES)) throw new ApiError(422, "INVALID_CHUNK_SIZE", "Upload chunks must be 16 MiB except for the final chunk.");
    try {
      const result = await this.storage.uploadChunk(upload, source, range.start, range.end);
      const updated = await this.repository.updateUploadProgress(ownerId, uploadId, result.receivedBytes);
      if (!result.complete) return { upload: updated, item: null };
      const completed = await this.storage.completeResumableUpload(updated);
      const node = await this.repository.completeUpload(ownerId, uploadId, completed.bytes, completed.checksum, completed.durationSeconds);
      return { upload: await this.repository.getUpload(ownerId, uploadId), item: node };
    } catch (error) {
      throw error;
    }
  }

  async getUpload(ownerId: string, uploadId: string) {
    const upload = await this.repository.getUpload(ownerId, uploadId);
    if (!upload || !["pending", "streaming"].includes(upload.status)) return upload;
    const progress = await this.storage.getResumableProgress(upload);
    if (progress.complete) {
      const streaming = await this.repository.markUploadStreaming(ownerId, uploadId);
      const completed = await this.storage.completeResumableUpload(streaming);
      await this.repository.completeUpload(ownerId, uploadId, completed.bytes, completed.checksum, completed.durationSeconds);
      return this.repository.getUpload(ownerId, uploadId);
    }
    if (progress.receivedBytes !== upload.receivedBytes) return this.repository.updateUploadProgress(ownerId, uploadId, progress.receivedBytes);
    return upload;
  }

  async listOpenUploads(ownerId: string) {
    const uploads = await this.repository.listOpenUploads(ownerId);
    return Promise.all(uploads.map(async (upload) => (await this.getUpload(ownerId, upload.id)) ?? upload));
  }

  async cancelUpload(ownerId: string, uploadId: string) {
    const upload = await this.repository.getUpload(ownerId, uploadId);
    if (!upload) return null;
    if (["pending", "streaming"].includes(upload.status)) await this.storage.cancelResumableUpload(upload).catch(() => undefined);
    return this.repository.cancelUpload(ownerId, uploadId);
  }

  async purgeExpiredUploads(batchSize = 100) {
    const candidates = await this.repository.listExpiredUploads(new Date(), batchSize);
    await Promise.all(candidates.map(async (upload) => {
      await this.storage.cancelResumableUpload(upload).catch(() => undefined);
      await this.repository.cancelUpload(upload.ownerId, upload.id);
    }));
    return { candidates: candidates.length };
  }
  getNodeForOwner(ownerId: string, nodeId: string) { return this.repository.getNodeForOwner(ownerId, nodeId, ["active"]); }
  getNode(nodeId: string) { return this.repository.getNode(nodeId); }
  getNodeByLegacyPath(ownerId: string, legacyStoragePath: string) { return this.repository.getNodeByLegacyPath(ownerId, legacyStoragePath); }
  getStorage(ownerId: string) { return this.repository.getUser(ownerId); }
  listTrash(ownerId: string, cursor?: string | null, pageSize?: number) { return this.repository.listTrash(ownerId, cursor, pageSize); }
  listFavorites(ownerId: string) { return this.repository.listFavorites(ownerId); }
  listShared(ownerId: string) { return this.repository.listSharedWithUser(ownerId); }
  setFavorite(ownerId: string, nodeId: string, enabled: boolean) { return this.repository.setFavorite(ownerId, nodeId, enabled); }
  listShares(ownerId: string, nodeId: string) { return this.repository.listShares(ownerId, nodeId); }
  createShare: DriveRepository["createShare"] = (input) => this.repository.createShare(input);
  revokeShare(ownerId: string, shareId: string) { return this.repository.revokeShare(ownerId, shareId); }
  resolvePublicShare(publicId: string) { return this.repository.resolvePublicShare(publicId); }
  resolveTokenShare(tokenHash: string) { return this.repository.resolveTokenShare(tokenHash); }
  findPublicShare(nodeId: string) { return this.repository.findPublicShare(nodeId); }
  stream(node: NodeRecord, options: { range?: string; download?: boolean }) { return this.storage.stream(node, options); }
  streamPreview(node: NodeRecord) { return this.storage.streamPreview(node); }
}
