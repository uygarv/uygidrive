import assert from "node:assert/strict";
import test from "node:test";
import { brand, brandTitle } from "../config/brand.js";

test("provides a complete editable brand configuration", () => {
  assert.ok(brand.name);
  assert.ok(brand.tagline);
  assert.ok(brand.description);
  assert.match(brand.logoPath, /^\//);
  assert.ok(brand.namespace);
  assert.equal(brandTitle("Settings"), `Settings | ${brand.name}`);
});
