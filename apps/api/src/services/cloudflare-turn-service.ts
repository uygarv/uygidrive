import { ApiError } from "../lib/errors.js";

export type IceServer = { urls: string[]; username?: string; credential?: string };

type CloudflareTurnConfig = {
  keyId: string | null;
  apiToken: string | null;
};

export class CloudflareTurnService {
  constructor(private readonly config: CloudflareTurnConfig, private readonly fetcher: typeof fetch = fetch) {}

  async iceServers(customIdentifier: string): Promise<IceServer[]> {
    if (!this.config.keyId || !this.config.apiToken) {
      throw new ApiError(503, "TURN_NOT_CONFIGURED", "Secure device transfers are not configured yet.");
    }
    let response: Response;
    try {
      response = await this.fetcher(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(this.config.keyId)}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: 8 * 60 * 60, customIdentifier }),
        // A network/DNS failure must not hold a Fastify request (or graceful
        // shutdown) open indefinitely.
        signal: AbortSignal.timeout(7_000),
      });
    } catch {
      throw new ApiError(503, "TURN_UNAVAILABLE", "A secure connection could not be prepared. Please try again.");
    }
    if (!response.ok) throw new ApiError(503, "TURN_UNAVAILABLE", "A secure connection could not be prepared. Please try again.");
    const body = await response.json() as { iceServers?: unknown };
    if (!Array.isArray(body.iceServers)) throw new ApiError(503, "TURN_UNAVAILABLE", "A secure connection could not be prepared. Please try again.");
    const iceServers = body.iceServers.flatMap((server): IceServer[] => {
      if (!server || typeof server !== "object") return [];
      const value = server as { urls?: unknown; username?: unknown; credential?: unknown };
      const urls = (Array.isArray(value.urls) ? value.urls : [value.urls]).filter((url): url is string => typeof url === "string" && !/:53(?:[/?]|$)/.test(url));
      return urls.length ? [{ urls, ...(typeof value.username === "string" ? { username: value.username } : {}), ...(typeof value.credential === "string" ? { credential: value.credential } : {}) }] : [];
    });
    if (!iceServers.length) throw new ApiError(503, "TURN_UNAVAILABLE", "A secure connection could not be prepared. Please try again.");
    return iceServers;
  }
}
