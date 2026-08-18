export type NodeKind = "file" | "folder";
export type NodeStatus = "active" | "uploading" | "trashed";
export type ShareMode = "public" | "link" | "recipient";
export type ShareLinkTarget = "preview" | "content";
export type AccessMode = "public" | "private";
export type ShareRole = "viewer" | "editor";

export type UserRecord = {
  id: string;
  email: string;
  username: string | null;
  usernameLower: string | null;
  avatarVersion: string | null;
  storageLimitBytes: number;
  storageUsedBytes: number;
  storageReservedBytes: number;
  createdAt: Date;
  updatedAt: Date;
};

export type NodeRecord = {
  id: string;
  ownerId: string;
  parentId: string | null;
  kind: NodeKind;
  status: NodeStatus;
  name: string;
  nameNormalized: string;
  storageKey: string | null;
  legacyStoragePath: string | null;
  sizeBytes: number;
  contentType: string | null;
  checksum: string | null;
  createdAt: Date;
  updatedAt: Date;
  trashedAt: Date | null;
  durationSeconds?: number;
  accessMode: AccessMode;
  createdBy?: string;
  updatedBy?: string;
};

export type ShareRecord = {
  id: string;
  nodeId: string;
  ownerId: string;
  mode: ShareMode;
  linkTarget: ShareLinkTarget;
  publicId: string | null;
  tokenHash: string | null;
  recipientId: string | null;
  role: ShareRole | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SharedItemRecord = {
  node: NodeRecord;
  role: ShareRole;
  source: "recipient" | "public-link" | "private-link";
  shareId: string;
};

export type UploadRecord = {
  id: string;
  ownerId: string;
  actorId: string;
  nodeId: string;
  parentId: string | null;
  name: string;
  contentType: string | null;
  expectedBytes: number;
  receivedBytes: number;
  storageKey: string;
  resumableSessionUri: string;
  status: "pending" | "streaming" | "completed" | "failed" | "cancelled";
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthenticatedUser = {
  uid: string;
  email: string | null;
};

export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};
