import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../app.js";
import { emailSchema, parse, passwordSchema } from "../contracts.js";
import { CSRF_COOKIE, issueCsrfToken, SESSION_COOKIE, sessionCookieOptions, requireUser } from "../plugins/auth.js";

const credentialsSchema = z.object({ email: emailSchema, password: passwordSchema });

export async function registerAuthRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/v1/auth/csrf", async (_request, reply) => ({ token: issueCsrfToken(reply, context.config) }));

  app.post("/v1/auth/sign-up", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = parse(credentialsSchema, request.body);
    const session = await context.authService.signUp(body.email, body.password);
    await context.repository.ensureUser(session.uid, session.email);
    reply.setCookie(SESSION_COOKIE, session.sessionCookie, sessionCookieOptions(context.config));
    return reply.code(201).send({ user: { id: session.uid, email: session.email } });
  });

  app.post("/v1/auth/sign-in", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = parse(credentialsSchema, request.body);
    const session = await context.authService.signIn(body.email, body.password);
    await context.repository.ensureUser(session.uid, session.email);
    reply.setCookie(SESSION_COOKIE, session.sessionCookie, sessionCookieOptions(context.config));
    return { user: { id: session.uid, email: session.email } };
  });

  app.post("/v1/auth/sign-out", async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    reply.clearCookie(CSRF_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/v1/auth/session", async (request) => {
    const user = await requireUser(request, context.firebase.auth);
    const profile = await context.repository.ensureUser(user.uid, user.email);
    return { user: { id: profile.id, email: profile.email }, storage: { usedBytes: profile.storageUsedBytes, reservedBytes: profile.storageReservedBytes, limitBytes: profile.storageLimitBytes } };
  });
}
