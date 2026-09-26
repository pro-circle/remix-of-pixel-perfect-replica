export const SESSION_TOKEN_KEY = "forge_session_token";

export function readSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SESSION_TOKEN_KEY);
}
