import "dotenv/config";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createFirebaseServices } from "./plugins/firebase.js";

const config = loadConfig();
const app = await buildApp({ config, firebase: createFirebaseServices(config) });

let isClosing = false;

async function close(signal: "SIGHUP" | "SIGINT" | "SIGTERM") {
  if (isClosing) return;
  isClosing = true;
  app.log.warn({ signal, pid: process.pid }, "Shutdown signal received");
  const forceExit = setTimeout(() => {
    app.log.error({ signal }, "Graceful shutdown timed out; forcing process exit");
    process.exit(1);
  // `tsx watch` force-kills a child after roughly five seconds. Exit sooner
  // if a third-party handle (for example Firebase gRPC) refuses to drain.
  }, 3_000);
  forceExit.unref();
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error, "Graceful shutdown failed");
    process.exit(1);
  } finally {
    clearTimeout(forceExit);
  }
}

process.once("SIGINT", () => close("SIGINT"));
process.once("SIGTERM", () => close("SIGTERM"));
process.once("SIGHUP", () => close("SIGHUP"));
process.on("uncaughtExceptionMonitor", (error, origin) => app.log.fatal({ error, origin }, "Uncaught process exception"));
process.on("exit", (code) => {
  // Synchronous by design: normal Fastify logging is not guaranteed to flush
  // once the process has begun exiting.
  console.error(JSON.stringify({ event: "api-process-exit", code, pid: process.pid }));
});

await app.listen({ host: "0.0.0.0", port: config.port });
