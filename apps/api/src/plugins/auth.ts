import { randomBytes } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ApiError } from "../lib/errors.js";
import type { AppConfig } from "../config.js";
import type { AuthenticatedUser } from "../types.js";

export const SESSION_COOKIE = "uygidrive_session";
export const CSRF_COOKIE = "uygidrive_csrf";

function secure(config: AppConfig) { return config.environment === "production"; }

export function sessionCookieOptions(config: AppConfig) {
  return { path: "/", httpOnly: true, secure: secure(config), sameSite: "lax" as const, maxAge: 5 * 24 * 60 * 60 };
}

export function csrfCookieOptions(config: AppConfig) {
  return { path: "/", httpOnly: false, secure: secure(config), sameSite: "lax" as const, maxAge: 24 * 60 * 60 };
}

export function issueCsrfToken(reply: FastifyReply, config: AppConfig) {
  const token = randomBytes(32).toString("base64url");
  reply.setCookie(CSRF_COOKIE, token, csrfCookieOptions(config));
  return token;
}

export function assertTrustedMutation(request: FastifyRequest, config: AppConfig) {
  const origin = request.headers.origin;
  const csrf = request.headers["x-csrf-token"];
  if (!origin || !config.webOrigins.includes(origin)) throw new ApiError(403, "UNTRUSTED_ORIGIN", "This request origin is not allowed.");
  if (typeof csrf !== "string" || csrf !== request.cookies[CSRF_COOKIE]) throw new ApiError(403, "CSRF_FAILED", "Refresh the page and try again.");
}

export async function requireUser(request: FastifyRequest, auth: Auth): Promise<AuthenticatedUser> {
  const session = request.cookies[SESSION_COOKIE];
  if (!session) throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
  try {
    const claims = await auth.verifySessionCookie(session, true);
    return { uid: claims.uid, email: claims.email ?? null };
  } catch {
    throw new ApiError(401, "UNAUTHENTICATED", "Your session has expired. Sign in again.");
  }
}
