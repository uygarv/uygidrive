import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import type { AppConfig } from "./config.js";
import { isApiError } from "./lib/errors.js";
import { assertTrustedMutation } from "./plugins/auth.js";
import type { FirebaseServices } from "./plugins/firebase.js";
import { FirestoreDriveRepository } from "./repositories/firestore-drive-repository.js";
import type { DriveRepository } from "./repositories/drive-repository.js";
import { AuthService } from "./services/auth-service.js";
import { DriveService } from "./services/drive-service.js";
import { StorageService } from "./services/storage-service.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerNodeRoutes } from "./routes/nodes.js";
import { registerShareRoutes } from "./routes/shares.js";
import { registerUploadRoutes } from "./routes/uploads.js";
import { registerLegacyShareRoutes } from "./routes/legacy.js";
import { registerMaintenanceRoutes } from "./routes/maintenance.js";

export type AppContext = {
  config: AppConfig;
  firebase: FirebaseServices;
  repository: DriveRepository;
  authService: AuthService;
  drive: DriveService;
};

export type BuildAppOptions = {
  config: AppConfig;
  firebase: FirebaseServices;
  repository?: DriveRepository;
};

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.config.environment !== "test", bodyLimit: 20 * 1024 * 1024, });
  const repository = options.repository ?? new FirestoreDriveRepository(options.firebase.firestore, options.config.defaultStorageLimitBytes);
  const context: AppContext = {
    config: options.config,
    firebase: options.firebase,
    repository,
    authService: new AuthService(options.firebase.auth, options.config.firebaseWebApiKey),
    drive: new DriveService(repository, new StorageService(options.firebase.bucket), options.config.uploadIntentTtlMinutes),
  };

  await app.register(cookie);
  await app.register(cors, {
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Content-Range", "X-CSRF-Token", "X-Upload-Content-Type", "Range"],
    origin(origin, callback) {
      if (!origin || context.config.webOrigins.includes(origin)) callback(null, true);
      else callback(new Error("Origin is not allowed by CORS."), false);
    },
  });
  await app.register(rateLimit, { global: true, max: 240, timeWindow: "1 minute", keyGenerator: (request) => request.ip });
  await app.register(multipart, { attachFieldsToBody: false, limits: { files: 1, fileSize: 100 * 1024 * 1024 * 1024 } });
  app.addContentTypeParser("application/octet-stream", (_request, payload, done) => done(null, payload));

  app.addHook("onRequest", async (request) => {
    if (request.url.startsWith("/v1/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) assertTrustedMutation(request, context.config);
  });

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = isApiError(error) ? error.statusCode : typeof (error as { statusCode?: unknown }).statusCode === "number" ? (error as { statusCode: number }).statusCode : 500;
    const code = isApiError(error) ? error.code : typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "INTERNAL_ERROR";
    const details = isApiError(error) ? error.details : (error as { details?: unknown }).details;
    if (statusCode >= 500) app.log.error(error);
    if (statusCode === 416 && code === "INVALID_RANGE" && details && typeof details === "object" && "size" in details && typeof details.size === "number") reply.header("content-range", `bytes */${details.size}`);
    const message = error instanceof Error ? error.message : "The request could not be completed.";
    reply.code(statusCode).send({ error: { code, message: statusCode >= 500 ? "Something went wrong. Please try again." : message, details: details ?? undefined } });
  });

  app.get("/healthz", async () => ({ status: "ok" }));
  await registerAuthRoutes(app, context);
  await registerNodeRoutes(app, context);
  await registerUploadRoutes(app, context);
  await registerShareRoutes(app, context);
  await registerLegacyShareRoutes(app, context);
  await registerMaintenanceRoutes(app, context);

  return app;
}
