import type { FastifyReply, FastifyRequest } from "fastify";
import type { NodeRecord, UserRecord } from "./types.js";
import type { DriveService } from "./services/drive-service.js";

export function nodeResponse(node: NodeRecord) {
  return {
    id: node.id,
    parentId: node.parentId,
    kind: node.kind,
    name: node.name,
    sizeBytes: node.sizeBytes,
    contentType: node.contentType,
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
    trashedAt: node.trashedAt?.toISOString() ?? null,
    durationSeconds: node.durationSeconds,
    accessMode: node.accessMode,
  };
}

export function userIdentityResponse(user: Pick<UserRecord, "id" | "username" | "avatarVersion">) {
  return { id: user.id, username: user.username, avatarUrl: user.avatarVersion ? `/v1/users/${encodeURIComponent(user.id)}/avatar?v=${encodeURIComponent(user.avatarVersion)}` : null };
}

function attachmentHeader(name: string) {
  const fallback = name.replace(/[\\"\r\n]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function inlineHeader(name: string) {
  const fallback = name.replaceAll("\\", "_").replaceAll('"', "_").replaceAll("\r", "_").replaceAll("\n", "_");
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function sendNodeContent(request: FastifyRequest, reply: FastifyReply, drive: DriveService, node: NodeRecord, download = false) {
  const result = await drive.stream(node, { range: request.headers.range, download });

  reply.hijack();
  const response = reply.raw;
  // `reply.hijack()` bypasses Fastify's normal send path. Copy queued headers
  // first so global headers such as CORS are retained on streamed responses.
  for (const [name, value] of Object.entries(reply.getHeaders())) {
    if (value !== undefined) response.setHeader(name, value);
  }
  response.statusCode = result.statusCode;
  response.setHeader("accept-ranges", "bytes");
  response.setHeader("content-type", result.contentType);
  response.setHeader("x-content-type-options", "nosniff");
  if (result.start !== null && result.end !== null) {
    response.setHeader("content-length", String(result.end - result.start + 1));
    response.setHeader("content-range", `bytes ${result.start}-${result.end}/${result.size}`);
  } else {
    response.removeHeader("content-length");
    // Transfer-Encoding is illegal in HTTP/2. Its native frames stream the
    // response and avoid Cloud Run's HTTP/1 full-response size limit.
    if (request.raw.httpVersionMajor !== 2) response.setHeader("transfer-encoding", "chunked");
  }
  response.setHeader("content-disposition", download || !result.inlineSafe ? attachmentHeader(node.name) : inlineHeader(node.name));

  const destroySource = () => {
    if (!result.stream.destroyed) result.stream.destroy();
  };
  request.raw.once("aborted", destroySource);
  response.once("close", destroySource);
  result.stream.once("error", (error) => {
    request.log.error({ err: error, nodeId: node.id }, "Cloud Storage download stream failed");
    if (!response.destroyed) response.destroy(error);
  });

  // Flush headers before the first Storage chunk. In HTTP/1 this commits
  // chunked transfer encoding; HTTP/2 uses native stream frames instead.
  response.flushHeaders();
  result.stream.pipe(response);
  return reply;
}
