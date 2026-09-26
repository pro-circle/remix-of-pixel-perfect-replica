import { Link, useNavigate } from "@tanstack/react-router";
import { Hammer } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { logout, me } from "@/lib/auth.functions";
import { Button, Spinner } from "./ui";

export const AUTH_KEY = "forge_auth";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(AUTH_KEY) !== "true") {
      navigate({ to: "/login" });
      return;
    }
    me()
      .then((r) => {
        if (r.authenticated) setReady(true);
        else {
          localStorage.removeItem(AUTH_KEY);
              localStorage.removeItem("forge_session_token");
          navigate({ to: "/login" });
        }
      })
      .catch(() => navigate({ to: "/login" }));
  }, [navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Hammer className="size-4 text-primary" />
            Forge
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await logout();
              localStorage.removeItem(AUTH_KEY);
              localStorage.removeItem("forge_session_token");
              navigate({ to: "/login" });
            }}
          >
            Log out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}

/** Wide shell without the max-width clamp, for the build screen. */
export function WideShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(AUTH_KEY) !== "true") {
      navigate({ to: "/login" });
      return;
    }
    me()
      .then((r) => {
        if (r.authenticated) setReady(true);
        else {
          localStorage.removeItem(AUTH_KEY);
              localStorage.removeItem("forge_session_token");
          navigate({ to: "/login" });
        }
      })
      .catch(() => navigate({ to: "/login" }));
  }, [navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Hammer className="size-4 text-primary" />
            Forge
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await logout();
              localStorage.removeItem(AUTH_KEY);
              localStorage.removeItem("forge_session_token");
              navigate({ to: "/login" });
            }}
          >
            Log out
          </Button>
        </div>
      </header>
      <main className="px-6 py-6">{children}</main>
    </div>
  );
}
