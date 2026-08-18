import assert from "node:assert/strict";
import test from "node:test";
import { createShareSchema, usernameSchema } from "./contracts.js";

test("validates canonical usernames", () => {
  assert.equal(usernameSchema.parse("uygi_drive"), "uygi_drive");
  for (const value of ["ab", "this_username_is_too_long", "Uygi", "with-dash", "has space"]) {
    assert.equal(usernameSchema.safeParse(value).success, false, value);
  }
});

test("accepts a content link only for link share modes", () => {
  assert.equal(createShareSchema.parse({ mode: "public", linkTarget: "content" }).linkTarget, "content");
  assert.equal(createShareSchema.safeParse({ mode: "recipient", recipientId: "user", role: "viewer", linkTarget: "content" }).success, false);
});
