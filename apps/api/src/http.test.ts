import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import type { FastifyReply, FastifyRequest } from "fastify";
import { sendNodeContent } from "./http.js";
import type { NodeRecord } from "./types.js";
import type { DriveService } from "./services/drive-service.js";

const node: NodeRecord = { id: "fil_123456789012", ownerId: "user", parentId: null, kind: "file", status: "active", name: "movie.mp4", nameNormalized: "movie.mp4", storageKey: "objects/user/file/original", legacyStoragePath: null, sizeBytes: 64 * 1024 * 1024, contentType: "video/mp4", checksum: null, createdAt: new Date(), updatedAt: new Date(), trashedAt: null, accessMode: "private" };

function replyRecorder() {
  const headers = new Map<string, string>();
  const reply = {
    code: () => reply,
    header: (name: string, value: string) => { headers.set(name.toLowerCase(), value); return reply; },
    send: (payload: unknown) => payload,
  };
  return { reply: reply as unknown as FastifyReply, headers };
}

function request(range?: string) {
  return { headers: { range }, log: { error: () => undefined } } as unknown as FastifyRequest;
}

test("streams a full response without Content-Length", async () => {
  const { reply, headers } = replyRecorder();
  const drive = { stream: async () => ({ stream: Readable.from("content"), statusCode: 200, size: node.sizeBytes, contentType: "video/mp4", start: null, end: null, download: true, inlineSafe: true }) } as unknown as DriveService;
  await sendNodeContent(request(), reply, drive, node, true);
  assert.equal(headers.has("content-length"), false);
  assert.equal(headers.get("accept-ranges"), "bytes");
  assert.match(headers.get("content-disposition") ?? "", /attachment/);
});

test("forwards download ranges and sets partial response headers", async () => {
  const { reply, headers } = replyRecorder();
  let options: unknown;
  const drive = { stream: async (_node: NodeRecord, value: unknown) => { options = value; return { stream: Readable.from("content"), statusCode: 206, size: 1000, contentType: "application/octet-stream", start: 100, end: 199, download: true, inlineSafe: false }; } } as unknown as DriveService;
  await sendNodeContent(request("bytes=100-199"), reply, drive, node, true);
  assert.deepEqual(options, { range: "bytes=100-199", download: true });
  assert.equal(headers.get("content-length"), "100");
  assert.equal(headers.get("content-range"), "bytes 100-199/1000");
});
