import { type DocumentData, type DocumentSnapshot, type Firestore, type Transaction } from "firebase-admin/firestore";
import { ApiError } from "../lib/errors.js";
import { normalizeName } from "../lib/format.js";
import type { NodeRecord, Page, ShareRecord, SharedItemRecord, UploadRecord, UserRecord } from "../types.js";
import type { CreateUploadInput, DriveRepository, ListNodesInput, NodeSort } from "./drive-repository.js";

const USERS = "users";
const USERNAMES = "usernames";
const NODES = "nodes";
const UPLOADS = "uploads";
const SHARES = "shares";
const FAVORITES = "favorites";
const SHARED_ITEMS = "sharedItems";

function toDate(value: unknown): Date {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  return new Date(0);
}

function requireData(snapshot: DocumentSnapshot<DocumentData>) {
  if (!snapshot.exists) throw new ApiError(404, "NOT_FOUND", "The requested item does not exist.");
  return snapshot.data()!;
}

function toUser(snapshot: DocumentSnapshot<DocumentData>): UserRecord {
  const data = requireData(snapshot);
  return {
    id: snapshot.id,
    email: String(data.email ?? ""),
    username: data.username ? String(data.username) : null,
    usernameLower: data.usernameLower ? String(data.usernameLower) : null,
    avatarVersion: data.avatarVersion ? String(data.avatarVersion) : null,
    storageLimitBytes: Number(data.storageLimitBytes ?? 0),
    storageUsedBytes: Number(data.storageUsedBytes ?? 0),
    storageReservedBytes: Number(data.storageReservedBytes ?? 0),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function toNode(snapshot: DocumentSnapshot<DocumentData>): NodeRecord {
  const data = requireData(snapshot);
  return {
    id: snapshot.id,
    ownerId: String(data.ownerId),
    parentId: data.parentId ? String(data.parentId) : null,
    kind: data.kind === "folder" ? "folder" : "file",
    status: data.status === "uploading" || data.status === "trashed" ? data.status : "active",
    name: String(data.name),
    nameNormalized: String(data.nameNormalized),
    storageKey: data.storageKey ? String(data.storageKey) : null,
    legacyStoragePath: data.legacyStoragePath ? String(data.legacyStoragePath) : null,
    sizeBytes: Number(data.sizeBytes ?? 0),
    contentType: data.contentType ? String(data.contentType) : null,
    checksum: data.checksum ? String(data.checksum) : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    trashedAt: data.trashedAt ? toDate(data.trashedAt) : null,
    durationSeconds: data.durationSeconds,
    accessMode: data.accessMode === "public" ? "public" : "private",
    createdBy: data.createdBy ? String(data.createdBy) : undefined,
    updatedBy: data.updatedBy ? String(data.updatedBy) : undefined,
  };
}

function toUpload(snapshot: DocumentSnapshot<DocumentData>): UploadRecord {
  const data = requireData(snapshot);
  return {
    id: snapshot.id,
    ownerId: String(data.ownerId),
    actorId: String(data.actorId ?? data.ownerId),
    nodeId: String(data.nodeId),
    parentId: data.parentId ? String(data.parentId) : null,
    name: String(data.name),
    contentType: data.contentType ? String(data.contentType) : null,
    expectedBytes: Number(data.expectedBytes),
    receivedBytes: Number(data.receivedBytes ?? 0),
    storageKey: String(data.storageKey),
    resumableSessionUri: String(data.resumableSessionUri ?? ""),
    status: data.status,
    expiresAt: toDate(data.expiresAt),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function toShare(snapshot: DocumentSnapshot<DocumentData>): ShareRecord {
  const data = requireData(snapshot);
  return {
    id: snapshot.id,
    nodeId: String(data.nodeId),
    ownerId: String(data.ownerId),
    mode: data.mode,
    linkTarget: data.linkTarget === "content" ? "content" : "preview",
    publicId: data.publicId ? String(data.publicId) : null,
    tokenHash: data.tokenHash ? String(data.tokenHash) : null,
    recipientId: data.recipientId ? String(data.recipientId) : null,
    role: data.role === "editor" ? "editor" : data.role === "viewer" ? "viewer" : null,
    expiresAt: data.expiresAt ? toDate(data.expiresAt) : null,
    revokedAt: data.revokedAt ? toDate(data.revokedAt) : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function sortDefinition(sort: NodeSort): { field: string; direction: "asc" | "desc" } {
  if (sort === "date:old-first") return { field: "createdAt", direction: "asc" };
  if (sort === "size:largest-first") return { field: "sizeBytes", direction: "desc" };
  if (sort === "size:smallest-first") return { field: "sizeBytes", direction: "asc" };
  return { field: "createdAt", direction: "desc" };
}

function decodeCursor(cursor: string | null | undefined) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { id?: string };
    return parsed.id ? parsed.id : null;
  } catch {
    throw new ApiError(400, "INVALID_CURSOR", "The list cursor is invalid.");
  }
}

function encodeCursor(id: string) {
  return Buffer.from(JSON.stringify({ id })).toString("base64url");
}

export class FirestoreDriveRepository implements DriveRepository {
  constructor(private readonly firestore: Firestore, private readonly defaultStorageLimitBytes: number) {}

  private userRef(uid: string) { return this.firestore.collection(USERS).doc(uid); }
  private usernameRef(usernameLower: string) { return this.firestore.collection(USERNAMES).doc(usernameLower); }
  private nodeRef(id: string) { return this.firestore.collection(NODES).doc(id); }
  private uploadRef(id: string) { return this.firestore.collection(UPLOADS).doc(id); }
  private shareRef(id: string) { return this.firestore.collection(SHARES).doc(id); }
  private sharedItemRef(userId: string, shareId: string) { return this.firestore.collection(SHARED_ITEMS).doc(`${userId}_${shareId}`); }

  async ensureUser(uid: string, email: string | null) {
    const ref = this.userRef(uid);
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const now = new Date();
      if (!snapshot.exists) {
        transaction.set(ref, { email: email ?? "", username: null, usernameLower: null, avatarVersion: null, storageLimitBytes: this.defaultStorageLimitBytes, storageUsedBytes: 0, storageReservedBytes: 0, createdAt: now, updatedAt: now });
      } else if (email && snapshot.data()?.email !== email) {
        transaction.update(ref, { email, updatedAt: now });
      }
    });
    return toUser(await ref.get());
  }

  async getUser(uid: string) {
    const snapshot = await this.userRef(uid).get();
    return snapshot.exists ? toUser(snapshot) : null;
  }

  async deleteUser(uid: string) {
    await this.userRef(uid).delete();
  }

  async setUsername(uid: string, username: string) {
    const usernameLower = username.toLowerCase();
    const userRef = this.userRef(uid);
    const requestedUsernameRef = this.usernameRef(usernameLower);
    await this.firestore.runTransaction(async (transaction) => {
      const user = await transaction.get(userRef);
      if (!user.exists) throw new ApiError(404, "PROFILE_NOT_FOUND", "Your profile is unavailable.");
      const currentUsernameLower = user.data()?.usernameLower ? String(user.data()?.usernameLower) : null;
      const currentUsernameRef = currentUsernameLower && currentUsernameLower !== usernameLower ? this.usernameRef(currentUsernameLower) : null;
      const [requested, current] = await Promise.all([
        transaction.get(requestedUsernameRef),
        currentUsernameRef ? transaction.get(currentUsernameRef) : Promise.resolve(null),
      ]);
      if (requested.exists && requested.data()?.userId !== uid) throw new ApiError(409, "USERNAME_TAKEN", "That username is already taken.");
      const now = new Date();
      transaction.set(requestedUsernameRef, { userId: uid, username, usernameLower, createdAt: requested.exists ? requested.data()?.createdAt ?? now : now, updatedAt: now });
      transaction.update(userRef, { username, usernameLower, updatedAt: now });
      if (currentUsernameRef && current?.data()?.userId === uid) transaction.delete(currentUsernameRef);
    });
    return toUser(await userRef.get());
  }

  async setAvatarVersion(uid: string, avatarVersion: string | null) {
    const ref = this.userRef(uid);
    await this.firestore.runTransaction(async (transaction) => {
      const user = await transaction.get(ref);
      if (!user.exists) throw new ApiError(404, "PROFILE_NOT_FOUND", "Your profile is unavailable.");
      transaction.update(ref, { avatarVersion, updatedAt: new Date() });
    });
    return toUser(await ref.get());
  }

  async findUsers(query: string, limit = 10) {
    const normalized = query.trim().replace(/^@/, "").toLowerCase();
    if (normalized.length < 2) return [];
    const snapshot = await this.firestore.collection(USERS).where("usernameLower", ">=", normalized).where("usernameLower", "<=", `${normalized}\uf8ff`).orderBy("usernameLower").limit(limit).get();
    return snapshot.docs.map((item) => ({ id: item.id, username: item.data().username ? String(item.data().username) : null, avatarVersion: item.data().avatarVersion ? String(item.data().avatarVersion) : null })).filter((item) => item.username !== null);
  }

  async getNodeForOwner(ownerId: string, nodeId: string, statuses?: NodeRecord["status"][]) {
    const snapshot = await this.nodeRef(nodeId).get();
    if (!snapshot.exists) return null;
    const node = toNode(snapshot);
    if (node.ownerId !== ownerId || (statuses && !statuses.includes(node.status))) return null;
    return node;
  }

  async getNode(nodeId: string) {
    const snapshot = await this.nodeRef(nodeId).get();
    return snapshot.exists ? toNode(snapshot) : null;
  }

  async getNodeByLegacyPath(ownerId: string, legacyStoragePath: string) {
    const snapshot = await this.firestore.collection(NODES).where("ownerId", "==", ownerId).where("legacyStoragePath", "==", legacyStoragePath).where("status", "==", "active").limit(1).get();
    return snapshot.empty ? null : toNode(snapshot.docs[0]!);
  }

  async listNodes(input: ListNodesInput): Promise<Page<NodeRecord>> {
    const search = input.search?.trim().toLocaleLowerCase("en-US");
    const definition = sortDefinition(input.sort);
    let query = this.firestore.collection(NODES)
      .where("ownerId", "==", input.ownerId)
      .where("parentId", "==", input.parentId)
      .where("status", "==", "active")
      .orderBy(definition.field, definition.direction);

    if (search) {
      // Firestore has no substring operator. Search stays scoped to the current folder and deliberately bounded.
      const snapshot = await query.limit(250).get();
      const items = snapshot.docs.map(toNode).filter((node) => node.nameNormalized.includes(search)).slice(0, input.pageSize);
      return { items, nextCursor: null };
    }

    const cursorId = decodeCursor(input.cursor);
    if (cursorId) {
      const cursor = await this.nodeRef(cursorId).get();
      if (!cursor.exists) throw new ApiError(400, "INVALID_CURSOR", "The list cursor no longer exists.");
      query = query.startAfter(cursor);
    }
    const snapshot = await query.limit(input.pageSize + 1).get();
    const nodes = snapshot.docs.map(toNode);
    const hasMore = nodes.length > input.pageSize;
    const items = hasMore ? nodes.slice(0, input.pageSize) : nodes;
    return { items, nextCursor: hasMore ? encodeCursor(items.at(-1)!.id) : null };
  }

  async listBreadcrumbs(ownerId: string, parentId: string | null) {
    const result: NodeRecord[] = [];
    const seen = new Set<string>();
    let currentId = parentId;
    while (currentId) {
      if (seen.has(currentId) || result.length >= 64) throw new ApiError(500, "INVALID_TREE", "Folder hierarchy is invalid.");
      seen.add(currentId);
      const node = await this.getNodeForOwner(ownerId, currentId, ["active"]);
      if (!node || node.kind !== "folder") throw new ApiError(404, "FOLDER_NOT_FOUND", "The current folder no longer exists.");
      result.unshift(node);
      currentId = node.parentId;
    }
    return result;
  }

  private async assertParent(transaction: Transaction, ownerId: string, parentId: string | null) {
    if (!parentId) return;
    const parent = await transaction.get(this.nodeRef(parentId));
    const data = requireData(parent);
    if (data.ownerId !== ownerId || data.kind !== "folder" || data.status !== "active") throw new ApiError(404, "PARENT_NOT_FOUND", "The destination folder does not exist.");
  }

  private async assertNameAvailable(transaction: Transaction, ownerId: string, parentId: string | null, nameNormalized: string, exceptNodeId?: string) {
    const duplicate = await transaction.get(this.firestore.collection(NODES)
      .where("ownerId", "==", ownerId)
      .where("parentId", "==", parentId)
      .where("status", "==", "active")
      .where("nameNormalized", "==", nameNormalized)
      .limit(2));
    if (duplicate.docs.some((document) => document.id !== exceptNodeId)) throw new ApiError(409, "NAME_CONFLICT", "An item with that name already exists in this folder.");
  }

  private async assertMoveDoesNotCreateCycle(transaction: Transaction, ownerId: string, nodeId: string, parentId: string | null) {
    const seen = new Set<string>();
    let currentId = parentId;
    while (currentId) {
      if (currentId === nodeId) throw new ApiError(422, "INVALID_MOVE", "A folder cannot be moved into itself or one of its subfolders.");
      if (seen.has(currentId) || seen.size >= 64) throw new ApiError(422, "INVALID_MOVE", "The destination folder hierarchy is invalid.");
      seen.add(currentId);
      const snapshot = await transaction.get(this.nodeRef(currentId));
      const data = requireData(snapshot);
      if (data.ownerId !== ownerId || data.kind !== "folder" || data.status !== "active") throw new ApiError(404, "PARENT_NOT_FOUND", "The destination folder does not exist.");
      currentId = data.parentId ? String(data.parentId) : null;
    }
  }

  async createFolder(input: { id: string; ownerId: string; parentId: string | null; name: string }) {
    const ref = this.nodeRef(input.id);
    const now = new Date();
    const nameNormalized = normalizeName(input.name);
    await this.firestore.runTransaction(async (transaction) => {
      await this.assertParent(transaction, input.ownerId, input.parentId);
      await this.assertNameAvailable(transaction, input.ownerId, input.parentId, nameNormalized);
      transaction.set(ref, { ownerId: input.ownerId, parentId: input.parentId, kind: "folder", status: "active", name: input.name, nameNormalized, storageKey: null, legacyStoragePath: null, sizeBytes: 0, contentType: null, checksum: null, accessMode: "private", createdBy: input.ownerId, updatedBy: input.ownerId, createdAt: now, updatedAt: now, trashedAt: null, isTrashRoot: false });
    });
    return toNode(await ref.get());
  }

  async updateNode(input: { ownerId: string; nodeId: string; name?: string; parentId?: string | null }) {
    const ref = this.nodeRef(input.nodeId);
    await this.firestore.runTransaction(async (transaction) => {
      const current = transaction.get(ref);
      const snapshot = await current;
      const data = requireData(snapshot);
      if (data.ownerId !== input.ownerId || data.status !== "active") throw new ApiError(404, "NOT_FOUND", "The item does not exist.");
      const parentId = input.parentId === undefined ? (data.parentId ?? null) : input.parentId;
      const name = input.name ?? String(data.name);
      const nameNormalized = normalizeName(name);
      await this.assertParent(transaction, input.ownerId, parentId);
      if (input.parentId !== undefined && data.kind === "folder") await this.assertMoveDoesNotCreateCycle(transaction, input.ownerId, input.nodeId, parentId);
      await this.assertNameAvailable(transaction, input.ownerId, parentId, nameNormalized, input.nodeId);
      transaction.update(ref, { parentId, name, nameNormalized, updatedBy: input.ownerId, updatedAt: new Date() });
    });
    return toNode(await ref.get());
  }

  async setNodeAccess(ownerId: string, nodeId: string, accessMode: "public" | "private") {
    const ref = this.nodeRef(nodeId);
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = requireData(snapshot);
      if (data.ownerId !== ownerId || data.status !== "active") throw new ApiError(404, "NOT_FOUND", "The item does not exist.");
      transaction.update(ref, { accessMode, updatedBy: ownerId, updatedAt: new Date() });
      if (accessMode === "private") {
        const publicShares = await this.firestore.collection(SHARES).where("nodeId", "==", nodeId).where("mode", "==", "public").where("revokedAt", "==", null).get();
        publicShares.docs.forEach((share) => transaction.update(share.ref, { revokedAt: new Date(), updatedAt: new Date() }));
      }
    });
    return toNode(await ref.get());
  }

  private async collectTree(ownerId: string, nodeId: string, statuses: NodeRecord["status"][]) {
    const root = await this.getNodeForOwner(ownerId, nodeId, statuses);
    if (!root) throw new ApiError(404, "NOT_FOUND", "The item does not exist.");
    const nodes = [root];
    const queue = [root.id];
    while (queue.length) {
      const parentId = queue.shift()!;
      const children = await this.firestore.collection(NODES).where("ownerId", "==", ownerId).where("parentId", "==", parentId).where("status", "in", statuses).get();
      for (const child of children.docs.map(toNode)) { nodes.push(child); queue.push(child.id); }
    }
    return nodes;
  }

  private async batchUpdate(nodes: NodeRecord[], data: Record<string, unknown>) {
    for (let index = 0; index < nodes.length; index += 400) {
      const batch = this.firestore.batch();
      for (const node of nodes.slice(index, index + 400)) batch.update(this.nodeRef(node.id), data);
      await batch.commit();
    }
  }

  async trashNode(ownerId: string, nodeId: string) {
    const nodes = await this.collectTree(ownerId, nodeId, ["active"]);
    const now = new Date();
    await this.batchUpdate([nodes[0]!], { status: "trashed", trashedAt: now, isTrashRoot: true, updatedAt: now });
    if (nodes.length > 1) await this.batchUpdate(nodes.slice(1), { status: "trashed", trashedAt: now, isTrashRoot: false, updatedAt: now });
    return nodes;
  }

  async restoreNode(ownerId: string, nodeId: string) {
    const ref = this.nodeRef(nodeId);
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = requireData(snapshot);
      if (data.ownerId !== ownerId || data.status !== "trashed") throw new ApiError(404, "NOT_FOUND", "The item does not exist in Trash.");
      let parentId = data.parentId ? String(data.parentId) : null;
      if (parentId) {
        const parent = await transaction.get(this.nodeRef(parentId));
        const parentData = parent.exists ? parent.data() : null;
        if (!parentData || parentData.ownerId !== ownerId || parentData.kind !== "folder" || parentData.status !== "active") parentId = null;
      }
      await this.assertNameAvailable(transaction, ownerId, parentId, String(data.nameNormalized), nodeId);
      if (parentId !== (data.parentId ?? null)) transaction.update(ref, { parentId, updatedAt: new Date() });
    });
    const nodes = await this.collectTree(ownerId, nodeId, ["trashed"]);
    await this.batchUpdate(nodes, { status: "active", trashedAt: null, isTrashRoot: false, updatedAt: new Date() });
    return toNode(await ref.get());
  }

  async permanentlyDeleteNodes(ownerId: string, nodeId: string) {
    const nodes = await this.collectTree(ownerId, nodeId, ["active", "trashed"]);
    return nodes;
  }

  async finalizePermanentDelete(ownerId: string, nodes: NodeRecord[]) {
    const filesBytes = nodes.filter((node) => node.kind === "file").reduce((sum, node) => sum + node.sizeBytes, 0);
    const userRef = this.userRef(ownerId);
    await this.firestore.runTransaction(async (transaction) => {
      const user = toUser(await transaction.get(userRef));
      transaction.update(userRef, { storageUsedBytes: Math.max(0, user.storageUsedBytes - filesBytes), updatedAt: new Date() });
    });
    for (let index = 0; index < nodes.length; index += 400) {
      const batch = this.firestore.batch();
      for (const node of nodes.slice(index, index + 400)) batch.delete(this.nodeRef(node.id));
      await batch.commit();
    }
  }

  async createUpload(input: CreateUploadInput) {
    const userRef = this.userRef(input.ownerId);
    const nodeRef = this.nodeRef(input.nodeId);
    const uploadRef = this.uploadRef(input.id);
    const now = new Date();
    await this.firestore.runTransaction(async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      const user = toUser(userSnapshot);
      if (user.storageUsedBytes + user.storageReservedBytes + input.expectedBytes > user.storageLimitBytes) throw new ApiError(413, "STORAGE_QUOTA_EXCEEDED", `Storage limit exceeded. You are using ${user.storageUsedBytes} bytes.`);
      await this.assertParent(transaction, input.ownerId, input.parentId);
      await this.assertNameAvailable(transaction, input.ownerId, input.parentId, normalizeName(input.name));
      transaction.set(nodeRef, { ownerId: input.ownerId, parentId: input.parentId, kind: "file", status: "uploading", name: input.name, nameNormalized: normalizeName(input.name), storageKey: input.storageKey, legacyStoragePath: null, sizeBytes: 0, contentType: input.contentType, checksum: null, accessMode: "private", createdBy: input.actorId ?? input.ownerId, updatedBy: input.actorId ?? input.ownerId, createdAt: now, updatedAt: now, trashedAt: null, isTrashRoot: false });
      transaction.set(uploadRef, { ownerId: input.ownerId, actorId: input.actorId ?? input.ownerId, nodeId: input.nodeId, parentId: input.parentId, name: input.name, contentType: input.contentType, expectedBytes: input.expectedBytes, receivedBytes: 0, storageKey: input.storageKey, resumableSessionUri: input.resumableSessionUri, status: "pending", expiresAt: input.expiresAt, createdAt: now, updatedAt: now });
      transaction.update(userRef, { storageReservedBytes: user.storageReservedBytes + input.expectedBytes, updatedAt: now });
    });
    return toUpload(await uploadRef.get());
  }

  async getUpload(ownerId: string, uploadId: string) {
    const snapshot = await this.uploadRef(uploadId).get();
    if (!snapshot.exists) return null;
    const upload = toUpload(snapshot);
    return upload.actorId === ownerId ? upload : null;
  }

  async listOpenUploads(ownerId: string) {
    const snapshot = await this.firestore.collection(UPLOADS).where("ownerId", "==", ownerId).get();
    return snapshot.docs
      .map(toUpload)
      .filter((upload) => ["pending", "streaming"].includes(upload.status) && upload.expiresAt > new Date());
  }

  async markUploadStreaming(ownerId: string, uploadId: string) {
    const ref = this.uploadRef(uploadId);
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const upload = toUpload(snapshot);
      if (upload.actorId !== ownerId || !["pending", "streaming"].includes(upload.status) || upload.expiresAt <= new Date()) throw new ApiError(409, "UPLOAD_UNAVAILABLE", "This upload is no longer available.");
      transaction.update(ref, { status: "streaming", updatedAt: new Date() });
    });
    return toUpload(await ref.get());
  }

  async updateUploadProgress(ownerId: string, uploadId: string, receivedBytes: number) {
    const ref = this.uploadRef(uploadId);
    await this.firestore.runTransaction(async (transaction) => {
      const upload = toUpload(await transaction.get(ref));
      if (upload.actorId !== ownerId || !["pending", "streaming"].includes(upload.status)) throw new ApiError(409, "UPLOAD_UNAVAILABLE", "This upload is no longer available.");
      if (!Number.isSafeInteger(receivedBytes) || receivedBytes < upload.receivedBytes || receivedBytes > upload.expectedBytes) throw new ApiError(422, "INVALID_UPLOAD_PROGRESS", "Upload progress is invalid.");
      transaction.update(ref, { status: "streaming", receivedBytes, updatedAt: new Date() });
    });
    return toUpload(await ref.get());
  }

  async completeUpload(
    ownerId: string,
    uploadId: string,
    receivedBytes: number,
    checksum: string | null,
    durationSeconds?: number,
  ) {
    const uploadRef = this.uploadRef(uploadId);

    await this.firestore.runTransaction(async (transaction) => {
      const uploadSnapshot = await transaction.get(uploadRef);
      const upload = toUpload(uploadSnapshot);

      if (upload.actorId !== ownerId || upload.status !== "streaming") {
        throw new ApiError(
          409,
          "UPLOAD_UNAVAILABLE",
          "This upload cannot be completed.",
        );
      }

      if (receivedBytes !== upload.expectedBytes) {
        throw new ApiError(
          422,
          "UPLOAD_SIZE_MISMATCH",
          "The uploaded size did not match the reserved size.",
        );
      }

      const userRef = this.userRef(upload.ownerId);
      const user = toUser(await transaction.get(userRef));

      transaction.update(this.nodeRef(upload.nodeId), {
        status: "active",
        sizeBytes: receivedBytes,
        checksum,
        durationSeconds: durationSeconds ?? null,
        updatedAt: new Date(),
      });

      transaction.update(uploadRef, {
        status: "completed",
        receivedBytes,
        updatedAt: new Date(),
      });

      transaction.update(userRef, {
        storageReservedBytes: Math.max(
          0,
          user.storageReservedBytes - upload.expectedBytes,
        ),
        storageUsedBytes: user.storageUsedBytes + receivedBytes,
        updatedAt: new Date(),
      });
    });

    const upload = toUpload(await uploadRef.get());

    return toNode(
      await this.nodeRef(upload.nodeId).get(),
    );
  }

  async failUpload(ownerId: string, uploadId: string) {
    const uploadRef = this.uploadRef(uploadId);
    let failed: UploadRecord | null = null;
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(uploadRef);
      if (!snapshot.exists) return;
      const upload = toUpload(snapshot);
      if (upload.actorId !== ownerId || ["completed", "failed", "cancelled"].includes(upload.status)) { failed = upload; return; }
      const user = toUser(await transaction.get(this.userRef(ownerId)));
      transaction.update(uploadRef, { status: "failed", updatedAt: new Date() });
      transaction.delete(this.nodeRef(upload.nodeId));
      transaction.update(this.userRef(ownerId), { storageReservedBytes: Math.max(0, user.storageReservedBytes - upload.expectedBytes), updatedAt: new Date() });
      failed = { ...upload, status: "failed" };
    });
    return failed;
  }

  async cancelUpload(ownerId: string, uploadId: string) {
    const uploadRef = this.uploadRef(uploadId);
    let cancelled: UploadRecord | null = null;
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(uploadRef);
      if (!snapshot.exists) return;
      const upload = toUpload(snapshot);
      if (upload.actorId !== ownerId || ["completed", "failed", "cancelled"].includes(upload.status)) { cancelled = upload; return; }
      const user = toUser(await transaction.get(this.userRef(upload.ownerId)));
      transaction.update(uploadRef, { status: "cancelled", updatedAt: new Date() });
      transaction.delete(this.nodeRef(upload.nodeId));
      transaction.update(this.userRef(upload.ownerId), { storageReservedBytes: Math.max(0, user.storageReservedBytes - upload.expectedBytes), updatedAt: new Date() });
      cancelled = { ...upload, status: "cancelled" };
    });
    return cancelled;
  }

  async createShare(input: { id: string; nodeId: string; ownerId: string; mode: ShareRecord["mode"]; linkTarget: ShareRecord["linkTarget"]; publicId: string | null; tokenHash: string | null; recipientId: string | null; role: ShareRecord["role"]; expiresAt: Date | null }) {
    const ref = this.shareRef(input.id);
    const now = new Date();
    await this.firestore.runTransaction(async (transaction) => {
      const node = await transaction.get(this.nodeRef(input.nodeId));
      if (!node.exists || node.data()?.ownerId !== input.ownerId || node.data()?.status !== "active") throw new ApiError(404, "NOT_FOUND", "The file does not exist.");
      const data = node.data()!;
      if (input.mode === "public" && data.accessMode !== "public") throw new ApiError(409, "PUBLIC_ACCESS_REQUIRED", "Set the item to Public before creating a public link.");
      if (input.mode === "recipient" && data.accessMode !== "private") throw new ApiError(409, "PRIVATE_ACCESS_REQUIRED", "Set the item to Private before sharing it with people.");
      if (input.linkTarget === "content" && data.kind !== "file") throw new ApiError(422, "CONTENT_LINK_FILE_REQUIRED", "File-content links are available only for files.");
      if (input.mode === "recipient" && input.role === "editor" && data.kind !== "folder") throw new ApiError(422, "EDITOR_FOLDER_REQUIRED", "Editor access is available only for folders.");
      transaction.set(ref, { ...input, revokedAt: null, createdAt: now, updatedAt: now });
    });
    return toShare(await ref.get());
  }

  async listShares(ownerId: string, nodeId: string) {
    const snapshot = await this.firestore.collection(SHARES).where("ownerId", "==", ownerId).where("nodeId", "==", nodeId).orderBy("createdAt", "desc").get();
    return snapshot.docs.map(toShare);
  }

  async revokeShare(ownerId: string, shareId: string) {
    const ref = this.shareRef(shareId);
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const share = toShare(snapshot);
      if (share.ownerId !== ownerId) throw new ApiError(404, "NOT_FOUND", "The share does not exist.");
      transaction.update(ref, { revokedAt: new Date(), updatedAt: new Date() });
    });
  }

  async updateShareRole(ownerId: string, shareId: string, role: "viewer" | "editor") {
    const ref = this.shareRef(shareId);
    await this.firestore.runTransaction(async (transaction) => {
      const share = toShare(await transaction.get(ref));
      if (share.ownerId !== ownerId || share.mode !== "recipient" || share.revokedAt) throw new ApiError(404, "NOT_FOUND", "The share does not exist.");
      const node = await transaction.get(this.nodeRef(share.nodeId));
      if (role === "editor" && node.data()?.kind !== "folder") throw new ApiError(422, "EDITOR_FOLDER_REQUIRED", "Editor access is available only for folders.");
      transaction.update(ref, { role, updatedAt: new Date() });
    });
    return toShare(await ref.get());
  }

  async recordSharedOpen(input: { userId: string; shareId: string; nodeId: string; source: "public-link" | "private-link" }) {
    const node = await this.getNode(input.nodeId);
    if (!node || node.ownerId === input.userId) return;
    await this.sharedItemRef(input.userId, input.shareId).set({ userId: input.userId, shareId: input.shareId, nodeId: input.nodeId, source: input.source, openedAt: new Date(), updatedAt: new Date() }, { merge: true });
  }

  async getRecipientAccess(userId: string, nodeId: string): Promise<{ role: "owner" | "viewer" | "editor"; rootId: string | null } | null> {
    const node = await this.getNode(nodeId);
    if (!node || node.status !== "active") return null;
    if (node.ownerId === userId) return { role: "owner", rootId: null };
    const seen = new Set<string>();
    let current: NodeRecord | null = node;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      const shares = await this.firestore.collection(SHARES).where("nodeId", "==", current.id).where("recipientId", "==", userId).where("revokedAt", "==", null).limit(10).get();
      const active = shares.docs.map(toShare).find((share) => share.mode === "recipient" && (!share.expiresAt || share.expiresAt > new Date()));
      if (active?.role) return { role: active.role, rootId: current.id };
      current = current.parentId ? await this.getNode(current.parentId) : null;
    }
    return null;
  }

  private async resolveShare(field: "publicId" | "tokenHash", value: string) {
    const snapshot = await this.firestore.collection(SHARES).where(field, "==", value).limit(1).get();
    if (snapshot.empty) return null;
    const share = toShare(snapshot.docs[0]!);
    if (share.revokedAt || (share.expiresAt && share.expiresAt <= new Date())) return null;
    return share;
  }

  resolvePublicShare(publicId: string) { return this.resolveShare("publicId", publicId); }
  resolveTokenShare(tokenHash: string) { return this.resolveShare("tokenHash", tokenHash); }

  async findPublicShare(nodeId: string) {
    const snapshot = await this.firestore.collection(SHARES).where("nodeId", "==", nodeId).where("mode", "==", "public").limit(10).get();
    return snapshot.docs.map(toShare).find((share) => !share.revokedAt && (!share.expiresAt || share.expiresAt > new Date())) ?? null;
  }

  async setFavorite(ownerId: string, nodeId: string, enabled: boolean) {
    const node = await this.getNodeForOwner(ownerId, nodeId, ["active"]);
    if (!node) throw new ApiError(404, "NOT_FOUND", "The file does not exist.");
    const ref = this.firestore.collection(FAVORITES).doc(`${ownerId}_${nodeId}`);
    if (enabled) await ref.set({ ownerId, nodeId, createdAt: new Date() });
    else await ref.delete();
  }

  async listFavorites(ownerId: string, _cursor?: string | null, pageSize = 25): Promise<Page<NodeRecord>> {
    const favorites = await this.firestore.collection(FAVORITES).where("ownerId", "==", ownerId).orderBy("createdAt", "desc").limit(pageSize).get();
    const nodes = await Promise.all(favorites.docs.map((favorite) => this.getNodeForOwner(ownerId, String(favorite.data().nodeId), ["active"])));
    return { items: nodes.filter((node): node is NodeRecord => Boolean(node)), nextCursor: null };
  }

  async listSharedWithUser(ownerId: string, _cursor?: string | null, pageSize = 25): Promise<Page<SharedItemRecord>> {
    const [direct, opened] = await Promise.all([
      this.firestore.collection(SHARES).where("recipientId", "==", ownerId).where("revokedAt", "==", null).orderBy("createdAt", "desc").limit(pageSize).get(),
      this.firestore.collection(SHARED_ITEMS).where("userId", "==", ownerId).orderBy("updatedAt", "desc").limit(pageSize).get(),
    ]);
    const items = new Map<string, SharedItemRecord>();
    for (const document of direct.docs) {
      const share = toShare(document);
      if (share.mode !== "recipient" || !share.role || (share.expiresAt && share.expiresAt <= new Date())) continue;
      const node = await this.getNode(share.nodeId);
      if (node?.status === "active" && node.accessMode === "private") items.set(node.id, { node, role: share.role, source: "recipient", shareId: share.id });
    }
    for (const document of opened.docs) {
      const data = document.data();
      const share = await this.shareRef(String(data.shareId)).get();
      if (!share.exists) continue;
      const source = toShare(share);
      const node = await this.getNode(String(data.nodeId));
      const visible = source.mode === "public" ? node?.accessMode === "public" : source.mode === "link";
      if (!node || node.status !== "active" || !visible || source.revokedAt || (source.expiresAt && source.expiresAt <= new Date())) continue;
      if (!items.has(node.id)) items.set(node.id, { node, role: "viewer", source: data.source === "private-link" ? "private-link" : "public-link", shareId: source.id });
    }
    return { items: [...items.values()].slice(0, pageSize), nextCursor: null };
  }

  async listTrash(ownerId: string, cursor?: string | null, pageSize = 25): Promise<Page<NodeRecord>> {
    let query = this.firestore.collection(NODES)
      .where("ownerId", "==", ownerId)
      .where("status", "==", "trashed")
      .where("isTrashRoot", "==", true)
      .orderBy("trashedAt", "desc");
    const cursorId = decodeCursor(cursor);
    if (cursorId) {
      const cursorDocument = await this.nodeRef(cursorId).get();
      if (!cursorDocument.exists) throw new ApiError(400, "INVALID_CURSOR", "The list cursor no longer exists.");
      query = query.startAfter(cursorDocument);
    }
    const snapshot = await query.limit(pageSize + 1).get();
    const nodes = snapshot.docs.map(toNode);
    const hasMore = nodes.length > pageSize;
    const items = hasMore ? nodes.slice(0, pageSize) : nodes;
    return { items, nextCursor: hasMore ? encodeCursor(items.at(-1)!.id) : null };
  }

  async listExpiredUploads(cutoff: Date, limit = 100) {
    const snapshot = await this.firestore.collection(UPLOADS)
      .where("expiresAt", "<=", cutoff)
      .where("status", "in", ["pending", "streaming"])
      .orderBy("expiresAt", "asc")
      .limit(limit)
      .get();
    return snapshot.docs.map(toUpload);
  }

  async listExpiredTrash(cutoff: Date, limit = 100) {
    const snapshot = await this.firestore.collection(NODES)
      .where("status", "==", "trashed")
      .where("isTrashRoot", "==", true)
      .where("trashedAt", "<=", cutoff)
      .orderBy("trashedAt", "asc")
      .limit(limit)
      .get();
    return snapshot.docs.map(toNode);
  }
}
