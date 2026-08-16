import assert from "node:assert/strict";
import test from "node:test";
import type { DriveRepository } from "../repositories/drive-repository.js";
import type { NodeRecord } from "../types.js";
import { StorageService } from "./storage-service.js";
import { DriveService } from "./drive-service.js";

const now = new Date();
const folder: NodeRecord = { id: "fld_123456789012", ownerId: "user", parentId: null, kind: "folder", status: "trashed", name: "Folder", nameNormalized: "folder", storageKey: null, legacyStoragePath: null, sizeBytes: 0, contentType: null, checksum: null, createdAt: now, updatedAt: now, trashedAt: now };
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
