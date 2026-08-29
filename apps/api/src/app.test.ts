import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig } from "./config.js";
import { buildApp } from "./app.js";
import type { FirebaseServices } from "./plugins/firebase.js";
import type { DriveRepository } from "./repositories/drive-repository.js";

const config: AppConfig = {
  environment: "test",
  port: 4000,
  webOrigins: ["http://localhost:3000"],
  firebaseServiceAccount: {},
  firebaseStorageBucket: "test-bucket",
  firebaseWebApiKey: "test-key",
  cookieDomain: null,
  sessionCookieName: "uygidrive_session",
  csrfCookieName: "uygidrive_csrf",
  legacyShareTokenSecret: null,
  defaultStorageLimitBytes: 2 * 1024 * 1024 * 1024,
  uploadIntentTtlMinutes: 60,
  trashRetentionDays: 30,
  maintenanceToken: null,
  enableHttp2: false,
  enableNativePreviews: false,
  cloudflareTurnKeyId: null,
  cloudflareTurnApiToken: null,
};

async function testApp(overrides: Partial<AppConfig> = {}) {
  return buildApp({ config: { ...config, ...overrides }, firebase: { auth: {}, firestore: {}, bucket: {} } as FirebaseServices, repository: {} as DriveRepository });
}

test("serves health and issues a CSRF token without Firebase access", async (context) => {
  const app = await testApp();
  context.after(() => app.close());
  const health = await app.inject({ method: "GET", url: "/healthz" });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { status: "ok" });

  const csrf = await app.inject({ method: "GET", url: "/v1/auth/csrf", headers: { origin: "http://localhost:3000" } });
  assert.equal(csrf.statusCode, 200);
  assert.equal(typeof csrf.json().token, "string");
  const cookies = Array.isArray(csrf.headers["set-cookie"]) ? csrf.headers["set-cookie"].join(";") : csrf.headers["set-cookie"] ?? "";
  assert.match(cookies, /uygidrive_csrf=/);
  assert.doesNotMatch(cookies, /Domain=/);
});

test("uses configured cookie names and an optional parent domain", async (context) => {
  const app = await testApp({ cookieDomain: ".example.test", sessionCookieName: "fork_session", csrfCookieName: "fork_csrf" });
  context.after(() => app.close());

  const csrf = await app.inject({ method: "GET", url: "/v1/auth/csrf", headers: { origin: "http://localhost:3000" } });
  assert.equal(csrf.statusCode, 200);
  const cookies = Array.isArray(csrf.headers["set-cookie"]) ? csrf.headers["set-cookie"].join(";") : csrf.headers["set-cookie"] ?? "";
  assert.match(cookies, /fork_csrf=/);
  assert.match(cookies, /Domain=\.example\.test/);
});

test("rejects protected API calls without a session", async (context) => {
  const app = await testApp();
  context.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/v1/nodes" });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "UNAUTHENTICATED");
});

test("reflects arbitrary origins only during local development", async (context) => {
  const app = await testApp({ environment: "development" });
  context.after(() => app.close());
  const origin = "http://192.168.68.118:3000";

  const response = await app.inject({ method: "GET", url: "/healthz", headers: { origin } });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["access-control-allow-origin"], origin);
});
