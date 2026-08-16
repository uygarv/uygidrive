import { createHash } from "node:crypto";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import { ApiError } from "../lib/errors.js";
import type { NodeRecord, UploadRecord } from "../types.js";
import type { FirebaseServices } from "../plugins/firebase.js";

export type StreamResult = { bytes: number; checksum: string };
export type PreviewStreamResult = { stream: Readable; contentType: "image/webp" };

const MAX_PREVIEW_SOURCE_BYTES = 50 * 1024 * 1024;
const PREVIEW_CONTENT_TYPE = "image/webp" as const;
const imageContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/tiff",
]);

function previewStorageKey(node: NodeRecord) {
  return `previews/${node.ownerId}/${node.id}.webp`;
}

function isPreviewableImage(node: NodeRecord) {
  if (/\.[^./]+$/.test(node.name)) return /\.(avif|gif|jpe?g|png|tiff?|webp)$/i.test(node.name);
  const contentType = node.contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType && imageContentTypes.has(contentType)) return true;
  return false;
}

function isPreviewablePdf(node: NodeRecord) {
  if (/\.pdf$/i.test(node.name)) return true;
  return node.contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/pdf";
}

export class StorageService {
  constructor(private readonly bucket: FirebaseServices["bucket"]) {}

  async upload(upload: UploadRecord, source: Readable, contentType: string | null): Promise<StreamResult> {
    const file = this.bucket.file(upload.storageKey);
    let bytes = 0;
    const hash = createHash("sha256");
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        hash.update(chunk);
        if (bytes > upload.expectedBytes) callback(new ApiError(413, "UPLOAD_SIZE_EXCEEDED", "The upload exceeds its reserved size."));
        else callback(null, chunk);
      },
    });
    try {
      await pipeline(source, meter, file.createWriteStream({
        resumable: false,
        metadata: { contentType: contentType || "application/octet-stream", metadata: { ownerId: upload.ownerId, nodeId: upload.nodeId } },
      }));
      if (bytes !== upload.expectedBytes) throw new ApiError(422, "UPLOAD_SIZE_MISMATCH", "The uploaded size did not match the reserved size.");
      return { bytes, checksum: hash.digest("hex") };
    } catch (error) {
      await file.delete({ ignoreNotFound: true }).catch(() => undefined);
      throw error;
    }
  }

  async delete(node: NodeRecord) {
    const keys = [node.storageKey, previewStorageKey(node)].filter((key): key is string => Boolean(key));
    await Promise.all(keys.map((key) => this.bucket.file(key).delete({ ignoreNotFound: true })));
  }

  async streamPreview(node: NodeRecord): Promise<PreviewStreamResult | null> {
    if (!node.storageKey || node.kind !== "file" || node.sizeBytes > MAX_PREVIEW_SOURCE_BYTES || (!isPreviewableImage(node) && !isPreviewablePdf(node))) return null;
    const preview = this.bucket.file(previewStorageKey(node));
    try {
      const [exists] = await preview.exists();
      if (!exists) await this.createPreview(node, preview);
      return { stream: preview.createReadStream(), contentType: PREVIEW_CONTENT_TYPE };
    } catch {
      // A corrupt image or a failed cache write should never prevent browsing files.
      return null;
    }
  }

  private async createPreview(node: NodeRecord, preview: ReturnType<FirebaseServices["bucket"]["file"]>) {
    if (!node.storageKey) return;
    try {
      await pipeline(
        this.bucket.file(node.storageKey).createReadStream(),
        sharp({ animated: false, density: isPreviewablePdf(node) ? 144 : 72, limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 }),
        preview.createWriteStream({
          resumable: false,
          metadata: {
            contentType: PREVIEW_CONTENT_TYPE,
            cacheControl: "private, max-age=86400",
            metadata: { ownerId: node.ownerId, nodeId: node.id, source: "preview" },
          },
        }),
      );
    } catch (error) {
      await preview.delete({ ignoreNotFound: true }).catch(() => undefined);
      throw error;
    }
  }

  async stream(node: NodeRecord, options: { range?: string; download?: boolean }) {
    if (!node.storageKey || node.kind !== "file") throw new ApiError(422, "NOT_A_FILE", "Folders cannot be downloaded.");
    const file = this.bucket.file(node.storageKey);
    try {
      const [metadata] = await file.getMetadata();
      const size = Number(metadata.size ?? node.sizeBytes);
      const contentType = metadata.contentType || node.contentType || "application/octet-stream";
      const download = Boolean(options.download);
      const range = !download ? parseRange(options.range, size) : null;
      return {
        stream: file.createReadStream(range ? { start: range.start, end: range.end } : undefined),
        statusCode: range ? 206 : 200,
        size,
        contentType,
        start: range?.start ?? null,
        end: range?.end ?? null,
        download,
        inlineSafe: isInlineSafe(contentType),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(404, "CONTENT_NOT_FOUND", "The file content is unavailable.");
    }
  }
}

function isInlineSafe(contentType: string) {
  const value = contentType.toLocaleLowerCase();
  return ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "application/pdf", "text/plain", "application/json"].includes(value) || value.startsWith("audio/") || value.startsWith("video/");
}

function parseRange(header: string | undefined, size: number) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) throw new ApiError(416, "INVALID_RANGE", "The requested range is invalid.", { size });
  const [, startValue, endValue] = match;
  const start = startValue ? Number(startValue) : undefined;
  const end = endValue ? Number(endValue) : undefined;
  if ((!Number.isInteger(start) && start !== undefined) || (!Number.isInteger(end) && end !== undefined)) throw new ApiError(416, "INVALID_RANGE", "The requested range is invalid.", { size });
  const resolvedStart = start ?? Math.max(0, size - (end ?? 0));
  const resolvedEnd = end ?? size - 1;
  if (resolvedStart < 0 || resolvedStart >= size || resolvedEnd < resolvedStart || resolvedEnd >= size) throw new ApiError(416, "INVALID_RANGE", "The requested range is invalid.", { size });
  return { start: resolvedStart, end: resolvedEnd };
}
