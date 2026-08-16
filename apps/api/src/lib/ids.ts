import { randomBytes, createHash } from "node:crypto";

export function id(prefix: string) {
  return `${prefix}_${randomBytes(18).toString("base64url")}`;
}

export function secretToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
