import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config.js";

function environment(overrides: Record<string, string> = {}) {
  return {
    NODE_ENV: "production",
    FIREBASE_SERVICE_ACCOUNT: "e30=",
    FIREBASE_STORAGE_BUCKET: "test-bucket",
    FIREBASE_WEB_API_KEY: "test-key",
    ...overrides,
  };
}

test("preserves the existing production cookie domain when COOKIE_DOMAIN is omitted", () => {
  assert.equal(loadConfig(environment()).cookieDomain, ".uygarv.com");
});

test("allows new installations to request host-only cookies", () => {
  assert.equal(loadConfig(environment({ COOKIE_DOMAIN: "" })).cookieDomain, null);
});
