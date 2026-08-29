import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppContext } from "../app.js";
import { emailSchema, parse, passwordSchema, usernameSchema } from "../contracts.js";
import { csrfCookieOptions, issueCsrfToken, sessionCookieOptions, requireUser } from "../plugins/auth.js";
import { userIdentityResponse } from "../http.js";
import { Readable } from "node:stream";
import { ApiError } from "../lib/errors.js";

const credentialsSchema = z.object({ email: emailSchema, password: passwordSchema });
const signUpSchema = credentialsSchema.extend({ username: usernameSchema });

function clearAuthCookie(reply: FastifyReply, name: string, options: NonNullable<Parameters<FastifyReply["clearCookie"]>[1]>) {
  const { domain: _domain, maxAge: _maxAge, ...hostCookieOptions } = options;
  const { maxAge: _domainMaxAge, ...domainCookieOptions } = options;

  // Clear both domain and host-only forms when a configured cookie domain is
  // used, so deployments can safely change cookie scope during a rollout.
  reply.clearCookie(name, domainCookieOptions);
  if ("domain" in options) reply.clearCookie(name, hostCookieOptions);
}

export async function registerAuthRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/v1/auth/csrf", async (_request, reply) => ({ token: issueCsrfToken(reply, context.config) }));

  app.post("/v1/auth/sign-up", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = parse(signUpSchema, request.body);
    const session = await context.authService.signUp(body.email, body.password);
    let profile;
    try {
      await context.repository.ensureUser(session.uid, session.email);
      profile = await context.repository.setUsername(session.uid, body.username);
    } catch (error) {
      await Promise.all([
        context.firebase.auth.deleteUser(session.uid).catch(() => undefined),
        context.repository.deleteUser(session.uid).catch(() => undefined),
      ]);
      throw error;
    }
    reply.setCookie(context.config.sessionCookieName, session.sessionCookie, sessionCookieOptions(context.config));
    return reply.code(201).send({ user: { ...userIdentityResponse(profile), needsUsername: false } });
  });

  app.post("/v1/auth/sign-in", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = parse(credentialsSchema, request.body);
    const session = await context.authService.signIn(body.email, body.password);
    const profile = await context.repository.ensureUser(session.uid, session.email);
    reply.setCookie(context.config.sessionCookieName, session.sessionCookie, sessionCookieOptions(context.config));
    return { user: { ...userIdentityResponse(profile), needsUsername: !profile.username } };
  });

  app.post("/v1/auth/sign-out", async (_request, reply) => {
    clearAuthCookie(reply, context.config.sessionCookieName, sessionCookieOptions(context.config));
    clearAuthCookie(reply, context.config.csrfCookieName, csrfCookieOptions(context.config));
    return reply.code(204).send();
  });

  app.get("/v1/auth/session", async (request) => {
    const user = await requireUser(request, context.firebase.auth, context.config);
    const profile = await context.repository.ensureUser(user.uid, user.email);
    return { user: { ...userIdentityResponse(profile), email: profile.email, needsUsername: !profile.username }, storage: { usedBytes: profile.storageUsedBytes, reservedBytes: profile.storageReservedBytes, limitBytes: profile.storageLimitBytes } };
  });

  app.get("/v1/profile", async (request) => {
    const user = await requireUser(request, context.firebase.auth, context.config);
    const profile = await context.repository.ensureUser(user.uid, user.email);
    return { profile: { ...userIdentityResponse(profile), email: profile.email } };
  });

  app.patch("/v1/profile", async (request) => {
    const user = await requireUser(request, context.firebase.auth, context.config);
    const { username } = parse(z.object({ username: usernameSchema }), request.body);
    const profile = await context.repository.setUsername(user.uid, username);
    return { profile: { ...userIdentityResponse(profile), email: profile.email } };
  });

  app.put("/v1/profile/avatar", { bodyLimit: 10 * 1024 * 1024 }, async (request) => {
    const user = await requireUser(request, context.firebase.auth, context.config);
    const source = request.body;
    if (!source || typeof (source as Readable).pipe !== "function") throw new ApiError(415, "INVALID_AVATAR", "Profile photo must be an image stream.");
    const profile = await context.drive.setAvatar(user.uid, source as Readable);
    return { profile: { ...userIdentityResponse(profile), email: profile.email } };
  });

  app.delete("/v1/profile/avatar", async (request) => {
    const user = await requireUser(request, context.firebase.auth, context.config);
    const profile = await context.drive.deleteAvatar(user.uid);
    return { profile: { ...userIdentityResponse(profile), email: profile.email } };
  });

  app.get("/v1/users/:userId/avatar", async (request, reply) => {
    await requireUser(request, context.firebase.auth, context.config);
    const { userId } = parse(z.object({ userId: z.string().min(1).max(128) }), request.params);
    const stream = await context.drive.streamAvatar(userId);
    if (!stream) return reply.code(404).send();
    return reply.header("cache-control", "private, max-age=86400").header("content-type", "image/webp").header("x-content-type-options", "nosniff").send(stream);
  });
}
