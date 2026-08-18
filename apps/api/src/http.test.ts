import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough, Readable } from "node:stream";
import type { FastifyReply, FastifyRequest } from "fastify";
import { sendNodeContent } from "./http.js";
import type { NodeRecord } from "./types.js";
import type { DriveService } from "./services/drive-service.js";

const node: NodeRecord = { id: "fil_123456789012", ownerId: "user", parentId: null, kind: "file", status: "active", name: "movie.mp4", nameNormalized: "movie.mp4", storageKey: "objects/user/file/original", legacyStoragePath: null, sizeBytes: 64 * 1024 * 1024, contentType: "video/mp4", checksum: null, createdAt: new Date(), updatedAt: new Date(), trashedAt: null, accessMode: "private" };

function replyRecorder() {
  const headers = new Map<string, string>();
  const body = new PassThrough();
  const chunks: Buffer[] = [];
  let flushed = false;
  let hijacked = false;
  body.on("data", (chunk: Buffer) => chunks.push(chunk));
  const raw = Object.assign(body, {
    statusCode: 200,
    setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
    removeHeader: (name: string) => headers.delete(name.toLowerCase()),
    flushHeaders: () => { flushed = true; },
  });
  const reply = {
    raw,
    hijack: () => { hijacked = true; return reply; },
  };
  return { reply: reply as unknown as FastifyReply, headers, body, chunks, get flushed() { return flushed; }, get hijacked() { return hijacked; } };
}

function request(range?: string, httpVersionMajor = 1) {
  const raw = new PassThrough();
  Object.assign(raw, { httpVersionMajor });
  return { headers: { range }, raw, log: { error: () => undefined } } as unknown as FastifyRequest;
}

test("streams a full response without Content-Length", async () => {
  const result = replyRecorder();
  const { reply, headers } = result;
  const drive = { stream: async () => ({ stream: Readable.from("content"), statusCode: 200, size: node.sizeBytes, contentType: "video/mp4", start: null, end: null, download: true, inlineSafe: true }) } as unknown as DriveService;
  await sendNodeContent(request(), reply, drive, node, true);
  await new Promise<void>((resolve) => result.body.once("end", resolve));
  assert.equal(result.hijacked, true);
  assert.equal(result.flushed, true);
  assert.equal(Buffer.concat(result.chunks).toString(), "content");
  assert.equal(headers.has("content-length"), false);
  assert.equal(headers.get("transfer-encoding"), "chunked");
  assert.equal(headers.get("accept-ranges"), "bytes");
  assert.match(headers.get("content-disposition") ?? "", /attachment/);
});

test("uses HTTP/2 frames instead of an HTTP/1 transfer header", async () => {
  const result = replyRecorder();
  const drive = { stream: async () => ({ stream: Readable.from("content"), statusCode: 200, size: node.sizeBytes, contentType: "video/mp4", start: null, end: null, download: false, inlineSafe: true }) } as unknown as DriveService;
  await sendNodeContent(request(undefined, 2), result.reply, drive, node);
  await new Promise<void>((resolve) => result.body.once("end", resolve));
  assert.equal(result.flushed, true);
  assert.equal(result.headers.get("transfer-encoding"), undefined);
  assert.equal(result.headers.has("content-length"), false);
});

test("forwards download ranges and sets partial response headers", async () => {
  const result = replyRecorder();
  const { reply, headers } = result;
  let options: unknown;
  const drive = { stream: async (_node: NodeRecord, value: unknown) => { options = value; return { stream: Readable.from("content"), statusCode: 206, size: 1000, contentType: "application/octet-stream", start: 100, end: 199, download: true, inlineSafe: false }; } } as unknown as DriveService;
  await sendNodeContent(request("bytes=100-199"), reply, drive, node, true);
  await new Promise<void>((resolve) => result.body.once("end", resolve));
  assert.deepEqual(options, { range: "bytes=100-199", download: true });
  assert.equal(headers.get("content-length"), "100");
  assert.equal(headers.get("content-range"), "bytes 100-199/1000");
});
