import "dotenv/config";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createFirebaseServices } from "./plugins/firebase.js";

const config = loadConfig();
const app = await buildApp({ config, firebase: createFirebaseServices(config) });

async function close() {
  await app.close();
  process.exit(0);
}

process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({ host: "0.0.0.0", port: config.port });
