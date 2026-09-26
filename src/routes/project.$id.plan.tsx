import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/forge/AppShell";
import { PlanEditor } from "@/components/forge/PlanEditor";
import { Button, ErrorNote, Skeleton, Stepper } from "@/components/forge/ui";
import { generatePlan, getProject, savePlan } from "@/lib/projects.functions";
import type { Plan } from "@/lib/types";

export const Route = createFileRoute("/project/$id/plan")({
  head: () => ({
    meta: [
      { title: "Your app blueprint — Forge" },
      { name: "description", content: "Review and edit the AI-generated architecture plan." },
      { property: "og:title", content: "Your app blueprint — Forge" },
      {
        property: "og:description",
        content: "Review and edit the AI-generated architecture plan.",
      },
    ],
  }),
  component: PlanReviewPage,
});

function PlanReviewPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [slow, setSlow] = useState(false);

  const project = useQuery({ queryKey: ["project", id], queryFn: () => getProject({ data: { id } }) });

  useEffect(() => {
    if (!project.data || plan || generating) return;
    if (project.data.plan) {
      setPlan(project.data.plan);
      return;
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.data]);

  async function run() {
    setGenerating(true);
    setError(null);
    const timer = setTimeout(() => setSlow(true), 30000);
    try {
      const generated = await generatePlan({ data: { id } });
      setPlan(generated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearTimeout(timer);
      setSlow(false);
      setGenerating(false);
    }
  }

  async function approve() {
    if (!plan) return;
    setSaving(true);
    try {
      await savePlan({ data: { id, plan, approve: true } });
      navigate({ to: "/project/$id/clarify", params: { id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <Stepper current={3} />
      <div className="fade-in-up mt-8">
        <h1 className="text-2xl">Your app blueprint</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review the plan. Edit anything before approving.
        </p>

        <div className="mt-6 space-y-4">
          {generating ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {slow ? "Taking longer than expected — still working…" : "AI is architecting your app…"}
              </p>
              <Skeleton className="h-28" />
              <Skeleton className="h-48" />
              <Skeleton className="h-40" />
            </div>
          ) : error ? (
            <>
              <ErrorNote message={error} />
              <Button variant="secondary" onClick={run}>
                <RotateCcw className="size-4" />
                Try again
              </Button>
            </>
          ) : plan ? (
            <>
              <PlanEditor plan={plan} onChange={setPlan} />
              <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={run}>
                  <RotateCcw className="size-4" />
                  Regenerate plan
                </Button>
                <Button loading={saving} onClick={approve}>
                  Approve plan
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </>
          ) : (
            <Skeleton className="h-40" />
          )}
        </div>
      </div>
    </AppShell>
  );
}
