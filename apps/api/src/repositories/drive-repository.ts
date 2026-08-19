import type { AccessMode, NodeRecord, Page, ShareMode, ShareRecord, SharedItemRecord, UploadRecord, UserRecord } from "../types.js";

export type NodeSort = "date:new-first" | "date:old-first" | "size:largest-first" | "size:smallest-first";

export type ListNodesInput = {
  ownerId: string;
  parentId: string | null;
  cursor?: string | null;
  pageSize: number;
  sort: NodeSort;
  search?: string;
};

export type CreateUploadInput = {
  id: string;
  ownerId: string;
  actorId?: string;
  parentId: string | null;
  nodeId: string;
  name: string;
  contentType: string | null;
  expectedBytes: number;
  storageKey: string;
  resumableSessionUri: string;
  expiresAt: Date;
};

export interface DriveRepository {
  ensureUser(uid: string, email: string | null): Promise<UserRecord>;
  getUser(uid: string): Promise<UserRecord | null>;
  deleteUser(uid: string): Promise<void>;
  setUsername(uid: string, username: string): Promise<UserRecord>;
  setAvatarVersion(uid: string, avatarVersion: string | null): Promise<UserRecord>;
  findUsers(query: string, limit?: number): Promise<Array<Pick<UserRecord, "id" | "username" | "avatarVersion">>>;
  getNodeForOwner(ownerId: string, nodeId: string, statuses?: NodeRecord["status"][]): Promise<NodeRecord | null>;
  getNode(nodeId: string): Promise<NodeRecord | null>;
  getNodeByLegacyPath(ownerId: string, legacyStoragePath: string): Promise<NodeRecord | null>;
  listNodes(input: ListNodesInput): Promise<Page<NodeRecord>>;
  listBreadcrumbs(ownerId: string, parentId: string | null): Promise<NodeRecord[]>;
  createFolder(input: { id: string; ownerId: string; parentId: string | null; name: string }): Promise<NodeRecord>;
  updateNode(input: { ownerId: string; nodeId: string; name?: string; parentId?: string | null }): Promise<NodeRecord>;
  setNodeAccess(ownerId: string, nodeId: string, accessMode: AccessMode): Promise<NodeRecord>;
  trashNode(ownerId: string, nodeId: string): Promise<NodeRecord[]>;
  restoreNode(ownerId: string, nodeId: string): Promise<NodeRecord>;
  permanentlyDeleteNodes(ownerId: string, nodeId: string): Promise<NodeRecord[]>;
  finalizePermanentDelete(ownerId: string, nodes: NodeRecord[]): Promise<void>;
  createUpload(input: CreateUploadInput): Promise<UploadRecord>;
  getUpload(ownerId: string, uploadId: string): Promise<UploadRecord | null>;
  listOpenUploads(ownerId: string): Promise<UploadRecord[]>;
  markUploadStreaming(ownerId: string, uploadId: string): Promise<UploadRecord>;
  updateUploadProgress(ownerId: string, uploadId: string, receivedBytes: number): Promise<UploadRecord>;
  completeUpload(ownerId: string, uploadId: string, receivedBytes: number, checksum: string | null, durationSeconds?: number,): Promise<NodeRecord>;
  failUpload(ownerId: string, uploadId: string): Promise<UploadRecord | null>;
  cancelUpload(ownerId: string, uploadId: string): Promise<UploadRecord | null>;
  listExpiredUploads(cutoff: Date, limit?: number): Promise<UploadRecord[]>;
  createShare(input: { id: string; nodeId: string; ownerId: string; mode: ShareMode; linkTarget: ShareRecord["linkTarget"]; publicId: string | null; tokenHash: string | null; recipientId: string | null; role: ShareRecord["role"]; expiresAt: Date | null }): Promise<ShareRecord>;
  listShares(ownerId: string, nodeId: string): Promise<ShareRecord[]>;
  revokeShare(ownerId: string, shareId: string): Promise<void>;
  revokePrivateLinks(ownerId: string, nodeId: string): Promise<number>;
  updateShareRole(ownerId: string, shareId: string, role: "viewer" | "editor"): Promise<ShareRecord>;
  resolvePublicShare(publicId: string): Promise<ShareRecord | null>;
  resolveTokenShare(tokenHash: string): Promise<ShareRecord | null>;
  findPublicShare(nodeId: string): Promise<ShareRecord | null>;
  setFavorite(ownerId: string, nodeId: string, enabled: boolean): Promise<void>;
  listFavorites(ownerId: string, cursor?: string | null, pageSize?: number): Promise<Page<NodeRecord>>;
  recordSharedOpen(input: { userId: string; shareId: string; nodeId: string; source: "public-link" | "private-link" }): Promise<void>;
  listSharedWithUser(ownerId: string, cursor?: string | null, pageSize?: number): Promise<Page<SharedItemRecord>>;
  getRecipientAccess(userId: string, nodeId: string): Promise<{ role: "owner" | "viewer" | "editor"; rootId: string | null } | null>;
  listTrash(ownerId: string, cursor?: string | null, pageSize?: number): Promise<Page<NodeRecord>>;
  listExpiredTrash(cutoff: Date, limit?: number): Promise<NodeRecord[]>;
}
