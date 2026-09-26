import { createHmac, timingSafeEqual } from "crypto";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";

const COOKIE = "forge_session";

function token(): string {
  const secret = process.env["SESSION_SECRET"] ?? "forge-dev-secret";
  return createHmac("sha256", secret).update("forge-demo-session").digest("hex");
}

export function checkCredentials(username: string, password: string): boolean {
  const expectedUser = process.env["FORGE_USERNAME"] ?? "user";
  const expectedPass = process.env["FORGE_PASSWORD"] ?? "12345678";
  return username === expectedUser && password === expectedPass;
}

export function issueSession(): void {
  setResponseHeader(
    "Set-Cookie",
    `${COOKIE}=${token()}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=86400`,
  );
}

export function clearSession(): void {
  setResponseHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0`);
}

export function isAuthenticated(): boolean {
  const cookie = getRequestHeader("cookie") ?? "";
  const match = cookie.match(new RegExp(`${COOKIE}=([a-f0-9]+)`));
  const value = match?.[1];
  if (!value) return false;
  const expected = token();
  if (value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

/** Throws when the caller has no valid demo session. */
export function requireSession(): void {
  if (!isAuthenticated()) throw new Error("UNAUTHENTICATED");
}
