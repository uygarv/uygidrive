import type { Auth } from "firebase-admin/auth";
import { ApiError } from "../lib/errors.js";

type IdentityResponse = {
  idToken?: string;
  email?: string;
  localId?: string;
  error?: { message?: string };
};

const authErrors: Record<string, { code: string; message: string }> = {
  EMAIL_EXISTS: { code: "EMAIL_EXISTS", message: "An account already uses this email address." },
  EMAIL_NOT_FOUND: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." },
  INVALID_PASSWORD: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." },
  INVALID_LOGIN_CREDENTIALS: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." },
  USER_DISABLED: { code: "USER_DISABLED", message: "This account has been disabled." },
  TOO_MANY_ATTEMPTS_TRY_LATER: { code: "RATE_LIMITED", message: "Too many attempts. Please try again later." },
};

export class AuthService {
  constructor(private readonly auth: Auth, private readonly webApiKey: string) {}

  private async identityRequest(operation: "signUp" | "signInWithPassword", email: string, password: string) {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${operation}?key=${encodeURIComponent(this.webApiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const result = await response.json() as IdentityResponse;
    if (!response.ok || !result.idToken) {
      const mapped = authErrors[result.error?.message ?? ""];
      throw new ApiError(mapped?.code === "RATE_LIMITED" ? 429 : 401, mapped?.code ?? "AUTHENTICATION_FAILED", mapped?.message ?? "Unable to authenticate with those details.");
    }
    return result;
  }

  async signUp(email: string, password: string) {
    return this.createSession(await this.identityRequest("signUp", email, password));
  }

  async signIn(email: string, password: string) {
    return this.createSession(await this.identityRequest("signInWithPassword", email, password));
  }

  private async createSession(result: IdentityResponse) {
    const idToken = result.idToken!;
    const decoded = await this.auth.verifyIdToken(idToken);
    const sessionCookie = await this.auth.createSessionCookie(idToken, { expiresIn: 5 * 24 * 60 * 60 * 1000 });
    return { sessionCookie, uid: decoded.uid, email: decoded.email ?? result.email ?? null };
  }
}
