import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/forge/AppShell";
import { Button, Card, ErrorNote, Stepper, Textarea } from "@/components/forge/ui";
import { createProject } from "@/lib/projects.functions";

export const Route = createFileRoute("/new")({
  head: () => ({
    meta: [
      { title: "Describe your app — Forge" },
      {
        name: "description",
        content: "Tell Forge what you want to build and it drafts the full architecture.",
      },
      { property: "og:title", content: "Describe your app — Forge" },
      {
        property: "og:description",
        content: "Tell Forge what you want to build and it drafts the full architecture.",
      },
    ],
  }),
  component: NewProjectPage,
});

function NewProjectPage() {
  const navigate = useNavigate();
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = description.trim().length;

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const project = await createProject({ data: { description } });
      navigate({ to: "/project/$id/stack", params: { id: project.id } });
    } catch (e) {
      const message = (e as Error).message;
      setError(
        message.includes("Supabase is not configured")
          ? "Add your Supabase URL and service role key to the .env file, then restart the dev server."
          : message,
      );
      toast.error("Could not create the project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <Stepper current={1} />
      <div className="fade-in-up mt-8 max-w-3xl">
        <h1 className="text-2xl">Describe your app</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The more detail you give, the sharper the generated code.
        </p>
        <Card className="mt-6 space-y-3">
          <Textarea
            rows={10}
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
            placeholder="e.g. A SaaS platform for freelancers to manage invoices, clients, and projects with a dashboard, reporting, and Stripe payments..."
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{count < 50 ? `${50 - count} more characters needed` : "Looks good"}</span>
            <span>{count} / 2000</span>
          </div>
          {error ? <ErrorNote message={error} /> : null}
          <div className="flex justify-end">
            <Button disabled={count < 50} loading={loading} onClick={submit}>
              Continue
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
