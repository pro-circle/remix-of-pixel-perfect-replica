import { createServerFn } from "@tanstack/react-start";

export const login = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { checkCredentials, issueSession } = await import("./session.server");
    if (!checkCredentials(data.username.trim(), data.password)) {
      return { success: false as const, error: "Incorrect username or password." };
    }
    issueSession();
    return { success: true as const };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { clearSession } = await import("./session.server");
  clearSession();
  return { success: true as const };
});

export const me = createServerFn({ method: "GET" }).handler(async () => {
  const { isAuthenticated } = await import("./session.server");
  return { authenticated: isAuthenticated() };
});
