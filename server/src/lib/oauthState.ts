import { createHmac } from "crypto";

const STATE_SECRET = process.env.OAUTH_STATE_SECRET ?? process.env.PASSWORD_SALT ?? "oauth-state-dev";

export function createOAuthState(userId: number): string {
  const data = JSON.stringify({ userId, t: Date.now() });
  const b64 = Buffer.from(data).toString("base64url");
  const sig = createHmac("sha256", STATE_SECRET).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function parseOAuthState(state: string): number | null {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  if (!b64 || !sig) return null;
  const expected = createHmac("sha256", STATE_SECRET).update(b64).digest("base64url");
  if (sig !== expected) return null;
  try {
    const parsed = JSON.parse(Buffer.from(b64, "base64url").toString()) as { userId: number; t: number };
    if (Date.now() - parsed.t > 15 * 60 * 1000) return null;
    return parsed.userId;
  } catch {
    return null;
  }
}
