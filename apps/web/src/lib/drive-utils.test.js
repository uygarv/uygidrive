import test from "node:test";
import assert from "node:assert/strict";
import { joinPath, normalizePath, pathSegments, previewKind } from "./drive-utils.js";

test("normalizes drive paths without leading or trailing separators", () => {
  assert.equal(normalizePath("/projects/design/"), "projects/design");
  assert.equal(joinPath("projects/", "/design", "brief.pdf"), "projects/design/brief.pdf");
  assert.deepEqual(pathSegments("projects/design/"), ["projects", "design"]);
});

test("selects safe preview behavior from file extensions", () => {
  assert.equal(previewKind("cover.png"), "image");
  assert.equal(previewKind("demo.mp4"), "video");
  assert.equal(previewKind("script.lua"), "code");
  assert.equal(previewKind("component.tsx"), "code");
  assert.equal(previewKind("archive.zip"), "download");
});
