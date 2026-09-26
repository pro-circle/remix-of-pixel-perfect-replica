import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Database, Monitor, Server } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/forge/AppShell";
import { Button, Card, Stepper } from "@/components/forge/ui";
import { updateProject } from "@/lib/projects.functions";
import { BACKENDS, DATABASES, FRONTENDS, makeStackId, type StackPart } from "@/lib/types";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StackPickerPage,
});

function Group({
  title,
  icon,
  options,
  value,
  onChange,
}: {
  title: string;
  icon: ReactNode;
  options: StackPart[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h2>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button key={opt.id} type="button" onClick={() => onChange(opt.id)} className="text-left">
              <Card
                className={cn(
                  "relative h-full transition-colors",
                  active
                    ? "border-primary bg-primary-soft/30 ring-1 ring-primary"
                    : "hover:border-muted-foreground/40",
                )}
              >
                {active ? <Check className="absolute top-4 right-4 size-4 text-primary" /> : null}
                <h3 className="pr-8 text-base font-semibold">{opt.name}</h3>
                <p className="mt-1 text-xs text-primary">{opt.detail}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{opt.blurb}</p>
              </Card>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StackPickerPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [fe, setFe] = useState<string | null>(null);
  const [be, setBe] = useState<string | null>(null);
  const [db, setDb] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ready = fe && be && db;

  async function submit() {
    if (!fe || !be || !db) return;
    setLoading(true);
    try {
      await updateProject({ data: { id, stack: makeStackId(fe, be, db), status: "PLANNING" } });
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
          Mix and match one of each. Starter files for your picks come ready-made, so building is faster.
        </p>

        <Group title="Frontend" icon={<Monitor className="size-4" />} options={FRONTENDS} value={fe} onChange={setFe} />
        <Group title="Backend" icon={<Server className="size-4" />} options={BACKENDS} value={be} onChange={setBe} />
        <Group title="Database" icon={<Database className="size-4" />} options={DATABASES} value={db} onChange={setDb} />

        <div className="mt-8 flex justify-end">
          <Button disabled={!ready} loading={loading} onClick={submit}>
            Generate plan
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
