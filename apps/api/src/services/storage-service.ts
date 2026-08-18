import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import { ApiError } from "../lib/errors.js";
import type { NodeRecord, UploadRecord } from "../types.js";
import type { FirebaseServices } from "../plugins/firebase.js";

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";


export type StreamResult = {
  bytes: number;
  checksum: string;
  durationSeconds?: number;
};

export const UPLOAD_CHUNK_BYTES = 32 * 1024 * 1024;
// Keep uploads started by already-open clients working during the 16 → 32 MiB
// rollout. New clients always send UPLOAD_CHUNK_BYTES.
export const LEGACY_UPLOAD_CHUNK_BYTES = 16 * 1024 * 1024;
export const UPLOAD_CHUNK_ALIGNMENT = 256 * 1024;

type ResumableResponse = { status: number; headers: Record<string, string | string[] | undefined>; data?: unknown };
type StorageAuthClient = { request(options: Record<string, unknown>): Promise<ResumableResponse> };

function receivedBytesFromRange(range: string | string[] | undefined) {
  const value = Array.isArray(range) ? range[0] : range;
  const match = value?.match(/bytes=0-(\d+)/i);
  return match ? Number(match[1]) + 1 : 0;
}

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

function isPreviewableVideo(node: NodeRecord) {
  if (/\.[^./]+$/.test(node.name)) {
    return /\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(node.name);
  }

  const contentType = node.contentType
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  return contentType?.startsWith("video/") ?? false;
}

function isVideoContentType(contentType: string | null) {
  return contentType
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase()
    .startsWith("video/") ?? false;
}

function probeDuration(url: string) {
  return new Promise<number | undefined>((resolve, reject) => {
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        url,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.once("error", reject);

    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
        return;
      }

      const duration = Number.parseFloat(stdout.trim());

      resolve(Number.isFinite(duration) ? duration : undefined);
    });
  });
}

function runFfmpegToStream(args: string[]): Readable {
  const child = spawn("ffmpeg", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;

    if (stderr.length > 10_000) {
      stderr = stderr.slice(-10_000);
    }
  });

  child.once("error", (error) => {
    child.stdout.destroy(error);
  });

  child.once("close", (code) => {
    if (code !== 0) {
      child.stdout.destroy(
        new Error(`ffmpeg exited with code ${code}: ${stderr}`),
      );
    }
  });

  return child.stdout;
}

export class StorageService {
  constructor(private readonly bucket: FirebaseServices["bucket"]) {}

  private authClient() {
    return (this.bucket.storage as unknown as { authClient: StorageAuthClient }).authClient;
  }

  async createResumableUpload(upload: Pick<UploadRecord, "storageKey" | "contentType" | "ownerId" | "nodeId">) {
    const file = this.bucket.file(upload.storageKey);
    const [uri] = await file.createResumableUpload({
      metadata: {
        contentType: upload.contentType || "application/octet-stream",
        metadata: { ownerId: upload.ownerId, nodeId: upload.nodeId },
      },
    });
    return uri;
  }

  private avatarKey(userId: string) { return `avatars/${userId}.webp`; }

  async saveAvatar(userId: string, source: Readable) {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of source) {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += value.length;
      if (bytes > 10 * 1024 * 1024) throw new ApiError(413, "AVATAR_TOO_LARGE", "Profile photos must be 10 MB or smaller.");
      chunks.push(value);
    }
    if (!bytes) throw new ApiError(422, "INVALID_AVATAR", "Choose an image for your profile photo.");
    let avatar: Buffer;
    try {
      avatar = await sharp(Buffer.concat(chunks)).rotate().resize(512, 512, { fit: "cover", position: "centre" }).webp({ quality: 82 }).toBuffer();
    } catch {
      throw new ApiError(422, "INVALID_AVATAR", "Profile photos must be valid images.");
    }
    await this.bucket.file(this.avatarKey(userId)).save(avatar, { contentType: "image/webp", resumable: false, metadata: { cacheControl: "private, max-age=86400" } });
  }

  async deleteAvatar(userId: string) { await this.bucket.file(this.avatarKey(userId)).delete({ ignoreNotFound: true }); }

  async streamAvatar(userId: string) {
    const file = this.bucket.file(this.avatarKey(userId));
    const [exists] = await file.exists();
    return exists ? file.createReadStream() : null;
  }

  private requestResumable(uri: string, options: Record<string, unknown>) {
    return this.authClient().request({
      url: uri,
      method: "PUT",
      validateStatus: (status: number) => status === 308 || (status >= 200 && status < 300),
      ...options,
    });
  }

  async getResumableProgress(upload: UploadRecord) {
    const response = await this.requestResumable(upload.resumableSessionUri, {
      data: Buffer.alloc(0),
      headers: { "Content-Length": "0", "Content-Range": `bytes */${upload.expectedBytes}` },
    });
    return { receivedBytes: response.status === 308 ? receivedBytesFromRange(response.headers.range) : upload.expectedBytes, complete: response.status !== 308 };
  }

  async uploadChunk(upload: UploadRecord, source: Readable, start: number, end: number) {
    const response = await this.requestResumable(upload.resumableSessionUri, {
      data: source,
      headers: {
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${upload.expectedBytes}`,
        "Content-Type": "application/octet-stream",
      },
    });
    return {
      receivedBytes: response.status === 308 ? receivedBytesFromRange(response.headers.range) : upload.expectedBytes,
      complete: response.status !== 308,
    };
  }

  async cancelResumableUpload(upload: UploadRecord) {
    await this.authClient().request({
      url: upload.resumableSessionUri,
      method: "DELETE",
      data: Buffer.alloc(0),
      validateStatus: (status: number) => status === 404 || status === 410 || (status >= 200 && status < 500),
    });
  }

  async completeResumableUpload(upload: UploadRecord) {
    const file = this.bucket.file(upload.storageKey);
    const [metadata] = await file.getMetadata();
    let durationSeconds: number | undefined;
    if (isVideoContentType(upload.contentType)) {
      try {
        const [signedUrl] = await file.getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 5 * 60 * 1000 });
        durationSeconds = await probeDuration(signedUrl);
      } catch {
        // Metadata extraction is best effort.
      }
    }
    return { bytes: Number(metadata.size ?? upload.expectedBytes), checksum: typeof metadata.md5Hash === "string" ? metadata.md5Hash : null, durationSeconds };
  }

  async upload(
    upload: UploadRecord,
    source: Readable,
    contentType: string | null,
  ): Promise<StreamResult> {
    const file = this.bucket.file(upload.storageKey);

    let bytes = 0;
    const hash = createHash("sha256");

    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        hash.update(chunk);

        if (bytes > upload.expectedBytes) {
          callback(
            new ApiError(
              413,
              "UPLOAD_SIZE_EXCEEDED",
              "The upload exceeds its reserved size.",
            ),
          );
        } else {
          callback(null, chunk);
        }
      },
    });

    try {
      await pipeline(
        source,
        meter,
        file.createWriteStream({
          resumable: false,
          metadata: {
            contentType: contentType || "application/octet-stream",
            metadata: {
              ownerId: upload.ownerId,
              nodeId: upload.nodeId,
            },
          },
        }),
      );

      if (bytes !== upload.expectedBytes) {
        throw new ApiError(
          422,
          "UPLOAD_SIZE_MISMATCH",
          "The uploaded size did not match its reserved size.",
        );
      }

      let durationSeconds: number | undefined;

      if (isVideoContentType(contentType)) {
        try {
          const [signedUrl] = await file.getSignedUrl({
            version: "v4",
            action: "read",
            expires: Date.now() + 5 * 60 * 1000,
          });

          durationSeconds = await probeDuration(signedUrl);
        } catch {
          // Media metadata failing shouldn't make
          // an otherwise valid upload fail.
        }
      }

      return {
        bytes,
        checksum: hash.digest("hex"),
        durationSeconds,
      };
    } catch (error) {
      await file
        .delete({ ignoreNotFound: true })
        .catch(() => undefined);

      throw error;
    }
  }

  async delete(node: NodeRecord) {
    const keys = [node.storageKey, previewStorageKey(node)].filter((key): key is string => Boolean(key));
    await Promise.all(keys.map((key) => this.bucket.file(key).delete({ ignoreNotFound: true })));
  }

  async streamPreview(node: NodeRecord): Promise<PreviewStreamResult | null> {
    if (
      !node.storageKey ||
      node.kind !== "file" ||
      node.sizeBytes > MAX_PREVIEW_SOURCE_BYTES ||
      (
        !isPreviewableImage(node) &&
        !isPreviewablePdf(node) &&
        !isPreviewableVideo(node)
      )
    ) {
      return null;
    }

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

  private async createVideoPreview(
    node: NodeRecord,
    preview: ReturnType<FirebaseServices["bucket"]["file"]>,
  ) {
    if (!node.storageKey) return;

    const source = this.bucket.file(node.storageKey);

    const [signedUrl] = await source.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 5 * 60 * 1000,
    });

    const frameStream = runFfmpegToStream([
      "-hide_banner",
      "-loglevel",
      "error",

      "-ss",
      "0.25",

      "-i",
      signedUrl,

      "-frames:v",
      "1",
      "-an",

      "-vf",
      "scale=960:960:force_original_aspect_ratio=decrease",

      "-f",
      "image2pipe",
      "-vcodec",
      "png",
      "pipe:1",
    ]);

    await pipeline(
      frameStream,

      sharp({
        limitInputPixels: 40_000_000,
      })
        .rotate()
        .resize({
          width: 960,
          height: 960,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82 }),

      preview.createWriteStream({
        resumable: false,
        metadata: {
          contentType: PREVIEW_CONTENT_TYPE,
          cacheControl: "private, max-age=86400",
          metadata: {
            ownerId: node.ownerId,
            nodeId: node.id,
            source: "video-preview",
          },
        },
      }),
    );
  }

  private async createPreview(
    node: NodeRecord,
    preview: ReturnType<FirebaseServices["bucket"]["file"]>,
  ) {
    if (!node.storageKey) return;

    try {
      if (isPreviewableVideo(node)) {
        await this.createVideoPreview(node, preview);
        return;
      }

      await pipeline(
        this.bucket.file(node.storageKey).createReadStream(),
        sharp({
          animated: false,
          // libvips renders the first PDF page directly. This avoids the
          // PDF.js + Skia canvas path, which can crash the Node process.
          density: isPreviewablePdf(node) ? 144 : 72,
          limitInputPixels: 40_000_000,
        })
          .rotate()
          .resize({
            width: 960,
            height: 960,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 82 }),
        preview.createWriteStream({
          resumable: false,
          metadata: {
            contentType: PREVIEW_CONTENT_TYPE,
            cacheControl: "private, max-age=86400",
            metadata: {
              ownerId: node.ownerId,
              nodeId: node.id,
              source: "preview",
            },
          },
        }),
      );
    } catch (error) {
      await preview
        .delete({ ignoreNotFound: true })
        .catch(() => undefined);

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
      const range = parseRange(options.range, size);
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
  // RFC 9110 permits a range end beyond EOF; the response simply ends at EOF.
  const resolvedEnd = Math.min(end ?? size - 1, size - 1);
  if (resolvedStart < 0 || resolvedStart >= size || resolvedEnd < resolvedStart) throw new ApiError(416, "INVALID_RANGE", "The requested range is invalid.", { size });
  return { start: resolvedStart, end: resolvedEnd };
}
