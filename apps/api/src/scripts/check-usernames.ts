import "dotenv/config";
import { loadConfig } from "../config.js";
import { createFirebaseServices } from "../plugins/firebase.js";

async function run() {
  const config = loadConfig();
  const { firestore } = createFirebaseServices(config);
  const users = await firestore.collection("users").get();
  const missing = users.docs.filter((user) => !user.data().username || !user.data().usernameLower);
  const claimed = users.docs.filter((user) => user.data().usernameLower).length;
  console.log(JSON.stringify({ mode: "dry-run", users: users.size, claimed, missingUsernames: missing.length, missingUserIds: missing.map((user) => user.id) }, null, 2));
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
