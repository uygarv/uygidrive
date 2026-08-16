import "dotenv/config";
import { spawn } from "node:child_process";
import { loadConfig } from "../config.js";
import { createFirebaseServices } from "../plugins/firebase.js";

const APPLY = process.argv.includes("--apply");
const CONCURRENCY = 3;
const PROBE_TIMEOUT_MS = 30_000;
const SIGNED_URL_TTL_MS = 5 * 60 * 1000;

function isVideoNode(data: Record<string, unknown>) {
  const contentType =
    typeof data.contentType === "string"
      ? data.contentType.split(";", 1)[0]?.trim().toLowerCase()
      : "";

  if (contentType?.startsWith("video/")) {
    return true;
  }

  const name = typeof data.name === "string" ? data.name : "";

  return /\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(name);
}

function hasDuration(data: Record<string, unknown>) {
  return (
    typeof data.durationSeconds === "number" &&
    Number.isFinite(data.durationSeconds) &&
    data.durationSeconds >= 0
  );
}

function probeDuration(url: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.env.FFPROBE_PATH || "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        url,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;

      settled = true;
      child.kill("SIGKILL");

      reject(
        new Error(
          `ffprobe timed out after ${PROBE_TIMEOUT_MS / 1000} seconds`,
        ),
      );
    }, PROBE_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;

      if (stdout.length > 10_000) {
        stdout = stdout.slice(-10_000);
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;

      if (stderr.length > 10_000) {
        stderr = stderr.slice(-10_000);
      }
    });

    child.once("error", (error) => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.once("close", (code) => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);

      if (code !== 0) {
        reject(
          new Error(
            `ffprobe exited with code ${code}: ${stderr.trim()}`,
          ),
        );
        return;
      }

      const duration = Number.parseFloat(stdout.trim());

      resolve(
        Number.isFinite(duration) && duration >= 0
          ? duration
          : null,
      );
    });
  });
}

async function runWithConcurrency<T>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<void>,
) {
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex++;

      if (index >= values.length) {
        return;
      }

      await worker(values[index]!, index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => runWorker(),
    ),
  );
}

const config = loadConfig();
const services = createFirebaseServices(config);

const snapshot = await services.firestore
  .collection("nodes")
  .where("kind", "==", "file")
  .get();

const videos = snapshot.docs.filter((document) => {
  const data = document.data();

  return (
    data.status === "active" &&
    typeof data.storageKey === "string" &&
    data.storageKey.length > 0 &&
    isVideoNode(data)
  );
});

const pending = videos.filter(
  (document) => !hasDuration(document.data()),
);

const summary = {
  fileNodes: snapshot.size,
  videos: videos.length,
  alreadyHaveDuration: videos.length - pending.length,
  missingDuration: pending.length,
  concurrency: CONCURRENCY,
  mode: APPLY ? "apply" : "dry-run",
};

console.table(summary);

if (!APPLY) {
  console.log(
    "Dry run only. Re-run with --apply to probe videos and write durationSeconds.",
  );

  process.exit(0);
}

let completed = 0;
let failed = 0;
let unavailable = 0;

await runWithConcurrency(
  pending,
  CONCURRENCY,
  async (document, index) => {
    const data = document.data();

    const name =
      typeof data.name === "string"
        ? data.name
        : document.id;

    const storageKey = data.storageKey as string;

    try {
      const file = services.bucket.file(storageKey);

      const [url] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + SIGNED_URL_TTL_MS,
      });

      const durationSeconds = await probeDuration(url);

      if (durationSeconds === null) {
        unavailable += 1;

        console.warn(
          `[${index + 1}/${pending.length}] No duration: ${name}`,
        );

        return;
      }

      await document.ref.update({
        durationSeconds,
      });

      completed += 1;

      console.log(
        `[${index + 1}/${pending.length}] ${name} -> ${durationSeconds.toFixed(3)}s`,
      );
    } catch (error) {
      failed += 1;

      console.error(
        `[${index + 1}/${pending.length}] Failed: ${name}`,
        error instanceof Error ? error.message : error,
      );
    }
  },
);

console.table({
  candidates: pending.length,
  updated: completed,
  unavailable,
  failed,
});

if (failed > 0) {
  console.warn(
    "Migration completed with failures. Re-running the script is safe because nodes that already have durationSeconds are skipped.",
  );
} else {
  console.log("Video duration migration finished.");
}