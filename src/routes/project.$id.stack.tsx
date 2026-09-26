import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/forge/AppShell";
import { Badge, Button, Card, Stepper } from "@/components/forge/ui";
import { updateProject } from "@/lib/projects.functions";
import { STACKS } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/project/$id/stack")({
  head: () => ({
    meta: [
      { title: "Choose your stack — Forge" },
      { name: "description", content: "Pick the frontend, backend and database for your project." },
      { property: "og:title", content: "Choose your stack — Forge" },
      {
        property: "og:description",
        content: "Pick the frontend, backend and database for your project.",
      },
    ],
  }),
  component: StackPickerPage,
});

function StackPickerPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!selected) return;
    setLoading(true);
    try {
      await updateProject({ data: { id, stack: selected, status: "PLANNING" } });
      navigate({ to: "/project/$id/plan", params: { id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <Stepper current={2} />
      <div className="fade-in-up mt-8">
        <h1 className="text-2xl">Choose your tech stack</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every generated file follows the conventions of the stack you pick.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {STACKS.map((stack) => {
            const active = selected === stack.id;
            return (
              <button
                key={stack.id}
                type="button"
                onClick={() => setSelected(stack.id)}
                className="text-left"
              >
                <Card
                  className={cn(
                    "relative h-full transition-colors",
                    active ? "border-primary bg-primary-soft/30 ring-1 ring-primary" : "hover:border-muted-foreground/40",
                  )}
                >
                  {active ? (
                    <Check className="absolute top-4 right-4 size-4 text-primary" />
                  ) : null}
                  <h3 className="pr-8 text-base font-semibold">{stack.name}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {stack.description}
                  </p>
                  <dl className="mt-4 space-y-1.5 text-xs">
                    <div className="flex gap-2">
                      <dt className="w-20 text-muted-foreground">Frontend</dt>
                      <dd>{stack.frontend}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-20 text-muted-foreground">Backend</dt>
                      <dd>{stack.backend}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-20 text-muted-foreground">Database</dt>
                      <dd>{stack.database}</dd>
                    </div>
                  </dl>
                  <div className="mt-4">
                    <Badge tone="info">Best for: {stack.bestFor}</Badge>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end">
          <Button disabled={!selected} loading={loading} onClick={submit}>
            Generate plan
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
