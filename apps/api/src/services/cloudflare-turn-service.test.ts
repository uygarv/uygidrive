import assert from "node:assert/strict";
import test from "node:test";
import { CloudflareTurnService } from "./cloudflare-turn-service.js";

test("creates Cloudflare ICE configuration without browser-blocked port 53 URLs", async () => {
  const requests: Request[] = [];
  const service = new CloudflareTurnService(
    { keyId: "turn-key", apiToken: "server-secret" },
    async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({ iceServers: [
        { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
        { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "short-lived-user", credential: "short-lived-credential" },
      ] });
    },
  );

  const servers = await service.iceServers("transfer:dtr_test:sender");
  assert.equal(requests[0]?.headers.get("authorization"), "Bearer server-secret");
  assert.match(await requests[0]?.text() ?? "", /"ttl":28800/);
  assert.deepEqual(servers, [
    { urls: ["stun:stun.cloudflare.com:3478"] },
    { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "short-lived-user", credential: "short-lived-credential" },
  ]);
});

test("does not create a transfer configuration when Cloudflare TURN is unavailable", async () => {
  const service = new CloudflareTurnService({ keyId: "turn-key", apiToken: "server-secret" }, async () => new Response("bad gateway", { status: 502 }));
  await assert.rejects(() => service.iceServers("transfer:dtr_test:sender"), { code: "TURN_UNAVAILABLE" });
});
