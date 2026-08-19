import assert from "node:assert/strict";
import test from "node:test";
import type { DriveRepository } from "../repositories/drive-repository.js";
import type { NodeRecord } from "../types.js";
import type { UploadRecord } from "../types.js";
import { StorageService } from "./storage-service.js";
import { DriveService } from "./drive-service.js";
import { UPLOAD_CHUNK_BYTES } from "./storage-service.js";
import { Readable } from "node:stream";

const now = new Date();
const folder: NodeRecord = { id: "fld_123456789012", ownerId: "user", parentId: null, kind: "folder", status: "trashed", name: "Folder", nameNormalized: "folder", storageKey: null, legacyStoragePath: null, sizeBytes: 0, contentType: null, checksum: null, createdAt: now, updatedAt: now, trashedAt: now, accessMode: "private" };
const child: NodeRecord = { ...folder, id: "fil_123456789012", parentId: folder.id, kind: "file", name: "Child", nameNormalized: "child", storageKey: "objects/user/child" };
const file: NodeRecord = { ...child, id: "fil_abcdefghijkl", parentId: null, name: "File", nameNormalized: "file", storageKey: "objects/user/file" };

test("purges only expired trash roots and permanently removes their stored files", async () => {
  const permanentlyDeleted: string[] = [];
  const finalized: NodeRecord[][] = [];
  const removedStorage: string[] = [];
  const repository = {
    listExpiredTrash: async () => [folder, child, file],
    permanentlyDeleteNodes: async (_ownerId: string, nodeId: string) => {
      permanentlyDeleted.push(nodeId);
      return nodeId === folder.id ? [folder, child] : [file];
    },
    finalizePermanentDelete: async (_ownerId: string, nodes: NodeRecord[]) => {
      finalized.push(nodes);
    },
  } as unknown as DriveRepository;
  const storage = {
    delete: async (node: NodeRecord) => {
      removedStorage.push(node.id);
    },
  } as unknown as StorageService;
  const drive = new DriveService(repository, storage, 60);

  const result = await drive.purgeExpiredTrash(30);

  assert.deepEqual(permanentlyDeleted, [folder.id, file.id]);
  assert.deepEqual(removedStorage, [child.id, file.id]);
  assert.equal(finalized.length, 2);
  assert.equal(result.deletedItems, 3);
});

test("empties every page of Trash and permanently removes stored files", async () => {
  const permanentlyDeleted: string[] = [];
  const removedStorage: string[] = [];
  let calls = 0;
  const repository = {
    listTrash: async () => ({ items: calls++ === 0 ? [folder, file] : [], nextCursor: null }),
    permanentlyDeleteNodes: async (_ownerId: string, nodeId: string) => {
      permanentlyDeleted.push(nodeId);
      return nodeId === folder.id ? [folder, child] : [file];
    },
    finalizePermanentDelete: async () => undefined,
  } as unknown as DriveRepository;
  const storage = {
    delete: async (node: NodeRecord) => {
      removedStorage.push(node.id);
    },
  } as unknown as StorageService;
  const drive = new DriveService(repository, storage, 60);

  const result = await drive.emptyTrash("user");

  assert.deepEqual(permanentlyDeleted, [folder.id, file.id]);
  assert.deepEqual(removedStorage, [child.id, file.id]);
  assert.equal(result.deletedItems, 3);
});

test("revokes all private links for an owned item", async () => {
  let requested: { ownerId: string; nodeId: string } | null = null;
  const repository = {
    revokePrivateLinks: async (ownerId: string, nodeId: string) => {
      requested = { ownerId, nodeId };
      return 2;
    },
  } as unknown as DriveRepository;
  const drive = new DriveService(repository, {} as StorageService, 60);

  const revoked = await drive.revokePrivateLinks("user", file.id);

  assert.deepEqual(requested, { ownerId: "user", nodeId: file.id });
  assert.equal(revoked, 2);
});

test("forwards an aligned upload chunk and persists Storage's acknowledged offset", async () => {
  const upload: UploadRecord = {
    id: "upl_123456789012", ownerId: "user", actorId: "user", nodeId: "fil_123456789012", parentId: null,
    name: "video.mp4", contentType: "video/mp4", expectedBytes: UPLOAD_CHUNK_BYTES * 2,
    receivedBytes: 0, storageKey: "objects/user/file/original", resumableSessionUri: "https://storage.example/session",
    status: "pending", expiresAt: new Date(Date.now() + 60_000), createdAt: now, updatedAt: now,
  };
  let persisted = 0;
  const repository = {
    markUploadStreaming: async () => ({ ...upload, status: "streaming" }),
    updateUploadProgress: async (_ownerId: string, _uploadId: string, receivedBytes: number) => {
      persisted = receivedBytes;
      return { ...upload, status: "streaming", receivedBytes };
    },
  } as unknown as DriveRepository;
  const storage = {
    uploadChunk: async () => ({ receivedBytes: UPLOAD_CHUNK_BYTES, complete: false }),
  } as unknown as StorageService;
  const drive = new DriveService(repository, storage, 60);

  const result = await drive.receiveUploadChunk("user", upload.id, Readable.from(Buffer.alloc(0)), {
    start: 0, end: UPLOAD_CHUNK_BYTES - 1, total: upload.expectedBytes,
  });

  assert.equal(persisted, UPLOAD_CHUNK_BYTES);
  assert.equal(result.item, null);
  assert.equal(result.upload?.receivedBytes, UPLOAD_CHUNK_BYTES);
});

test("rejects a non-final chunk that does not match the configured chunk size", async () => {
  const upload: UploadRecord = {
    id: "upl_abcdefghijkl", ownerId: "user", actorId: "user", nodeId: "fil_abcdefghijkl", parentId: null,
    name: "video.mp4", contentType: "video/mp4", expectedBytes: UPLOAD_CHUNK_BYTES * 2,
    receivedBytes: 0, storageKey: "objects/user/file/original", resumableSessionUri: "https://storage.example/session",
    status: "pending", expiresAt: new Date(Date.now() + 60_000), createdAt: now, updatedAt: now,
  };
  const repository = { markUploadStreaming: async () => ({ ...upload, status: "streaming" }) } as unknown as DriveRepository;
  const drive = new DriveService(repository, {} as StorageService, 60);

  await assert.rejects(
    drive.receiveUploadChunk("user", upload.id, Readable.from(Buffer.alloc(0)), { start: 0, end: 1023, total: upload.expectedBytes }),
    { code: "INVALID_CHUNK_SIZE" },
  );
});
