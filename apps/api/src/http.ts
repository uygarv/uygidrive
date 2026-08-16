import type { FastifyReply, FastifyRequest } from "fastify";
import type { NodeRecord } from "./types.js";
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
    durationSeconds: node.durationSeconds
  };
}

function attachmentHeader(name: string) {
  const fallback = name.replace(/[\\"\r\n]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function sendNodeContent(request: FastifyRequest, reply: FastifyReply, drive: DriveService, node: NodeRecord, download = false) {
  const result = await drive.stream(node, { range: request.headers.range, download });
  reply.code(result.statusCode).header("accept-ranges", "bytes").header("content-type", result.contentType).header("content-length", String(result.end === null ? result.size : result.end - result.start! + 1)).header("x-content-type-options", "nosniff");
  if (result.start !== null && result.end !== null) reply.header("content-range", `bytes ${result.start}-${result.end}/${result.size}`);
  if (download || !result.inlineSafe) reply.header("content-disposition", attachmentHeader(node.name));
  return reply.send(result.stream);
}
