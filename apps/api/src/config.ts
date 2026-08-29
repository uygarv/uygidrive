import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  FIREBASE_SERVICE_ACCOUNT: z.string().min(1),
  FIREBASE_STORAGE_BUCKET: z.string().min(1),
  FIREBASE_WEB_API_KEY: z.string().min(1),
  // Omitted means an existing UygiDrive production deployment; an explicit
  // empty value opts a new deployment into host-only cookies.
  COOKIE_DOMAIN: z.string().trim().optional(),
  SESSION_COOKIE_NAME: z.string().min(1).max(128).default("uygidrive_session"),
  CSRF_COOKIE_NAME: z.string().min(1).max(128).default("uygidrive_csrf"),
  LEGACY_SHARE_TOKEN_SECRET: z.string().min(1).optional(),
  DEFAULT_STORAGE_LIMIT_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024 * 1024),
  UPLOAD_INTENT_TTL_MINUTES: z.coerce.number().int().positive().max(7 * 24 * 60).default(7 * 24 * 60),
  TRASH_RETENTION_DAYS: z.coerce.number().int().positive().max(365).default(30),
  MAINTENANCE_TOKEN: z.string().min(32).optional(),
  ENABLE_HTTP2: z.enum(["true", "false"]).default("false"),
  ENABLE_NATIVE_PREVIEWS: z.enum(["true", "false"]).default("false"),
  CLOUDFLARE_TURN_KEY_ID: z.string().min(1).optional(),
  CLOUDFLARE_TURN_API_TOKEN: z.string().min(1).optional(),
});

export type AppConfig = {
  environment: "development" | "test" | "production";
  port: number;
  webOrigins: string[];
  firebaseServiceAccount: Record<string, unknown>;
  firebaseStorageBucket: string;
  firebaseWebApiKey: string;
  cookieDomain: string | null;
  sessionCookieName: string;
  csrfCookieName: string;
  legacyShareTokenSecret: string | null;
  defaultStorageLimitBytes: number;
  uploadIntentTtlMinutes: number;
  trashRetentionDays: number;
  maintenanceToken: string | null;
  enableHttp2: boolean;
  enableNativePreviews: boolean;
  cloudflareTurnKeyId: string | null;
  cloudflareTurnApiToken: string | null;
};

function decodeServiceAccount(value: string) {
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT must be base64-encoded JSON or JSON.");
    }
  }
}

export function loadConfig(environment = process.env): AppConfig {
  const parsed = environmentSchema.parse(environment);
  return {
    environment: parsed.NODE_ENV,
    port: parsed.PORT,
    webOrigins: parsed.WEB_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean),
    firebaseServiceAccount: decodeServiceAccount(parsed.FIREBASE_SERVICE_ACCOUNT),
    firebaseStorageBucket: parsed.FIREBASE_STORAGE_BUCKET,
    firebaseWebApiKey: parsed.FIREBASE_WEB_API_KEY,
    cookieDomain: parsed.COOKIE_DOMAIN === undefined
      ? parsed.NODE_ENV === "production" ? ".uygarv.com" : null
      : parsed.COOKIE_DOMAIN || null,
    sessionCookieName: parsed.SESSION_COOKIE_NAME,
    csrfCookieName: parsed.CSRF_COOKIE_NAME,
    legacyShareTokenSecret: parsed.LEGACY_SHARE_TOKEN_SECRET ?? null,
    defaultStorageLimitBytes: parsed.DEFAULT_STORAGE_LIMIT_BYTES,
    uploadIntentTtlMinutes: parsed.UPLOAD_INTENT_TTL_MINUTES,
    trashRetentionDays: parsed.TRASH_RETENTION_DAYS,
    maintenanceToken: parsed.MAINTENANCE_TOKEN ?? null,
    enableHttp2: parsed.ENABLE_HTTP2 === "true",
    enableNativePreviews: parsed.ENABLE_NATIVE_PREVIEWS === "true",
    cloudflareTurnKeyId: parsed.CLOUDFLARE_TURN_KEY_ID ?? null,
    cloudflareTurnApiToken: parsed.CLOUDFLARE_TURN_API_TOKEN ?? null,
  };
}
