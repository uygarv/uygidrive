import "dotenv/config";
import { loadConfig } from "../config.js";
import { createFirebaseServices } from "../plugins/firebase.js";

const APPLY = process.argv.includes("--apply");

async function run() {
  const config = loadConfig();
  const { firestore } = createFirebaseServices(config);
  const [nodes, shares] = await Promise.all([firestore.collection("nodes").get(), firestore.collection("shares").get()]);
  const publicNodeIds = new Set(shares.docs.filter((item) => item.data().mode === "public" && !item.data().revokedAt).map((item) => String(item.data().nodeId)));
  let updated = 0;
  let batches = 0;
  for (let index = 0; index < nodes.docs.length; index += 350) {
    const batch = firestore.batch();
    for (const node of nodes.docs.slice(index, index + 350)) {
      const data = node.data();
      if (!data.accessMode) { batch.update(node.ref, { accessMode: publicNodeIds.has(node.id) ? "public" : "private", createdBy: data.createdBy ?? data.ownerId, updatedBy: data.updatedBy ?? data.ownerId }); updated += 1; }
    }
    if (APPLY && updated > batches * 350) { await batch.commit(); batches += 1; }
  }
  for (let index = 0; index < shares.docs.length; index += 350) {
    const batch = firestore.batch();
    let changes = 0;
    for (const share of shares.docs.slice(index, index + 350)) {
      if (share.data().mode === "recipient" && !share.data().role) { batch.update(share.ref, { role: "viewer" }); changes += 1; }
    }
    if (APPLY && changes) await batch.commit();
  }
  console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", nodes: nodes.size, shares: shares.size, nodeUpdates: updated }));
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
