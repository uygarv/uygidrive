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
  legacyShareTokenSecret: null,
  defaultStorageLimitBytes: 2 * 1024 * 1024 * 1024,
  uploadIntentTtlMinutes: 60,
  trashRetentionDays: 30,
  maintenanceToken: null,
  enableHttp2: false,
};

async function testApp() {
  return buildApp({ config, firebase: { auth: {}, firestore: {}, bucket: {} } as FirebaseServices, repository: {} as DriveRepository });
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
  assert.match(Array.isArray(csrf.headers["set-cookie"]) ? csrf.headers["set-cookie"].join(";") : csrf.headers["set-cookie"] ?? "", /uygidrive_csrf=/);
});

test("rejects protected API calls without a session", async (context) => {
  const app = await testApp();
  context.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/v1/nodes" });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "UNAUTHENTICATED");
});
