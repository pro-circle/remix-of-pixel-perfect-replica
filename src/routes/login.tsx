import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Hammer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AUTH_KEY } from "@/components/forge/AppShell";
import { Button, Card, ErrorNote, Input } from "@/components/forge/ui";
import { login } from "@/lib/auth.functions";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Forge" },
      { name: "description", content: "Sign in to Forge to generate full-stack apps with AI." },
      { property: "og:title", content: "Sign in — Forge" },
      {
        property: "og:description",
        content: "Sign in to Forge to generate full-stack apps with AI.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await login({ data: { username, password } });
      if (!result.success) {
        setError(result.error);
        return;
      }
      localStorage.setItem(AUTH_KEY, "true");
      toast.success("Welcome to Forge");
      navigate({ to: "/" });
    } catch {
      setError("Could not sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="fade-in-up w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <Hammer className="size-5 text-primary" />
          <span className="text-lg font-semibold tracking-tight">Forge</span>
        </div>
        <h1 className="text-xl">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe an app, get a complete project.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <Input
            placeholder="Username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <ErrorNote message={error} /> : null}
          <Button type="submit" className="w-full" loading={loading}>
            Enter Forge
          </Button>
        </form>
      </Card>
    </div>
  );
}
