import assert from "node:assert/strict";
import test from "node:test";
import { formatBytes, safeFileName } from "./format.js";

test("formats storage values for API responses", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1_536), "1.5 KB");
  assert.equal(formatBytes(2 * 1024 * 1024 * 1024), "2 GB");
});

test("rejects names that could become storage paths", () => {
  assert.equal(safeFileName("Quarterly plan.pdf"), "Quarterly plan.pdf");
  assert.equal(safeFileName("nested/report.pdf"), null);
  assert.equal(safeFileName(".."), null);
  assert.equal(safeFileName("bad\u0000name"), null);
});
