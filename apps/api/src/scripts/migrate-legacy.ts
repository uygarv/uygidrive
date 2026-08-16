import "dotenv/config";
import { createHash } from "node:crypto";
import { loadConfig } from "../config.js";
import { normalizeName } from "../lib/format.js";
import { createFirebaseServices } from "../plugins/firebase.js";

const STORAGE_METADATA_FILE = ".uygidrive-storage.json";
const APPLY = process.argv.includes("--apply");

type PlannedDocument = { path: string; data: Record<string, unknown> };
type LegacyMetadata = { name?: string; size?: string | number; timeCreated?: string; updated?: string; contentType?: string; md5Hash?: string; metadata?: { public?: string } };
type LegacyFile = {
  name: string;
  metadata?: unknown;
  getMetadata(): Promise<[unknown, unknown]>;
};

function deterministicId(prefix: string, value: string) {
  return `${prefix}_${createHash("sha256").update(value).digest("base64url").slice(0, 30)}`;
}

function asDate(value: unknown) {
  const date = value ? new Date(String(value)) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function legacyPathParts(objectName: string) {
  const pieces = objectName.split("/");
  const ownerId = pieces.shift();
  if (!ownerId || !pieces.length) return null;
  return { ownerId, relativePath: pieces.join("/") };
}

function folderId(ownerId: string, relativePath: string) {
  return deterministicId("fld", `${ownerId}:folder:${relativePath}`);
}

function fileId(ownerId: string, relativePath: string) {
  return deterministicId("fil", `${ownerId}:file:${relativePath}`);
}

function parentPath(relativePath: string) {
  const parts = relativePath.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function folderDocuments(ownerId: string, relativePath: string, createdAt: Date) {
  const folders: PlannedDocument[] = [];
  const segments = relativePath.split("/").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    const parent = current;
    current = current ? `${current}/${segment}` : segment;
    folders.push({
      path: `nodes/${folderId(ownerId, current)}`,
      data: {
        ownerId,
        parentId: parent ? folderId(ownerId, parent) : null,
        kind: "folder",
        status: "active",
        name: segment,
        nameNormalized: normalizeName(segment),
        storageKey: null,
        legacyStoragePath: `${current}/`,
        sizeBytes: 0,
        contentType: null,
        checksum: null,
        createdAt,
        updatedAt: createdAt,
        trashedAt: null,
        isTrashRoot: false,
      },
    });
  }
  return folders;
}

async function readMetadata(file: LegacyFile) {
  const existing = file.metadata as LegacyMetadata | undefined;
  if (existing?.size !== undefined && existing.name) return existing;
  const [metadata] = await file.getMetadata();
  return metadata as LegacyMetadata;
}

async function writeMissing(documents: PlannedDocument[], firestore: ReturnType<typeof createFirebaseServices>["firestore"]) {
  let written = 0;
  for (let index = 0; index < documents.length; index += 350) {
    const slice = documents.slice(index, index + 350);
    const refs = slice.map((document) => firestore.doc(document.path));
    const existing = await firestore.getAll(...refs);
    const batch = firestore.batch();
    for (let itemIndex = 0; itemIndex < slice.length; itemIndex += 1) {
      if (!existing[itemIndex]!.exists) {
        batch.create(refs[itemIndex]!, slice[itemIndex]!.data);
        written += 1;
      }
    }
    if (!existing.every((snapshot) => snapshot.exists)) await batch.commit();
  }
  return written;
}

const config = loadConfig();
const services = createFirebaseServices(config);
const [files] = await services.bucket.getFiles({ autoPaginate: true });
const documents = new Map<string, PlannedDocument>();
const usageByOwner = new Map<string, number>();
let skippedMetadata = 0;

for (const file of files) {
  const parsed = legacyPathParts(file.name);
  if (!parsed) continue;
  const { ownerId, relativePath } = parsed;
  if (relativePath === STORAGE_METADATA_FILE) { skippedMetadata += 1; continue; }
  const metadata = await readMetadata(file);
  const createdAt = asDate(metadata.timeCreated);
  const isFolderMarker = file.name.endsWith("/");
  const folderPath = isFolderMarker ? relativePath.replace(/\/+$/, "") : parentPath(relativePath);
  for (const folder of folderDocuments(ownerId, folderPath, createdAt)) documents.set(folder.path, folder);
  if (isFolderMarker) continue;

  const name = relativePath.split("/").at(-1)!;
  const sizeBytes = Number(metadata.size ?? 0);
  const id = fileId(ownerId, relativePath);
  documents.set(`nodes/${id}`, {
    path: `nodes/${id}`,
    data: {
      ownerId,
      parentId: folderPath ? folderId(ownerId, folderPath) : null,
      kind: "file",
      status: "active",
      name,
      nameNormalized: normalizeName(name),
      storageKey: file.name,
      legacyStoragePath: relativePath,
      sizeBytes,
      contentType: metadata.contentType ?? null,
      checksum: metadata.md5Hash ?? null,
      createdAt,
      updatedAt: asDate(metadata.updated ?? metadata.timeCreated),
      trashedAt: null,
      isTrashRoot: false,
    },
  });
  usageByOwner.set(ownerId, (usageByOwner.get(ownerId) ?? 0) + sizeBytes);

  if (metadata.metadata?.public === "true") {
    const shareId = deterministicId("shr", `${ownerId}:public:${relativePath}`);
    documents.set(`shares/${shareId}`, {
      path: `shares/${shareId}`,
      data: {
        nodeId: id,
        ownerId,
        mode: "public",
        publicId: deterministicId("pub", `${ownerId}:public:${relativePath}`),
        tokenHash: null,
        recipientId: null,
        expiresAt: null,
        revokedAt: null,
        createdAt,
        updatedAt: createdAt,
      },
    });
  }
}

for (const [ownerId, storageUsedBytes] of usageByOwner) {
  documents.set(`users/${ownerId}`, {
    path: `users/${ownerId}`,
    data: {
      email: "",
      storageLimitBytes: config.defaultStorageLimitBytes,
      storageUsedBytes,
      storageReservedBytes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

const summary = { bucketObjects: files.length, plannedDocuments: documents.size, users: usageByOwner.size, skippedMetadata, mode: APPLY ? "apply" : "dry-run" };
console.table(summary);

if (!APPLY) {
  console.log("Dry run only. Re-run with --apply after checking the counts and taking a Firestore export.");
  process.exit(0);
}

const created = await writeMissing([...documents.values()], services.firestore);
console.log(`Migration finished. Created ${created} missing Firestore documents without overwriting existing data.`);
