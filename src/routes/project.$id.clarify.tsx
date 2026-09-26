import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Hammer, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/forge/AppShell";
import { Button, Card, ErrorNote, Input, Skeleton, Stepper } from "@/components/forge/ui";
import { generateQuestions, getProject, saveAnswers } from "@/lib/projects.functions";
import type { Question } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/project/$id/clarify")({
  head: () => ({
    meta: [
      { title: "A few quick questions — Forge" },
      { name: "description", content: "Answer a handful of questions to sharpen the generated code." },
      { property: "og:title", content: "A few quick questions — Forge" },
      {
        property: "og:description",
        content: "Answer a handful of questions to sharpen the generated code.",
      },
    ],
  }),
  component: ClarifyPage,
});

function ClarifyPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const project = useQuery({ queryKey: ["project", id], queryFn: () => getProject({ data: { id } }) });

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!project.data || questions.length > 0 || loading) return;
    if (project.data.questions.length > 0) {
      setQuestions(project.data.questions);
      return;
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.data]);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setQuestions(await generateQuestions({ data: { id } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const current = questions[index];
  const answered = useMemo(
    () => questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length,
    [questions, answers],
  );
  const allAnswered = questions.length > 0 && answered === questions.length;

  async function submit() {
    setSubmitting(true);
    try {
      await saveAnswers({
        data: {
          id,
          answers: questions.map((q) => ({
            id: q.id,
            question: q.question,
            answer: answers[q.id] ?? "",
          })),
        },
      });
      navigate({ to: "/project/$id/build", params: { id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <Stepper current={4} />
      <div className="fade-in-up mt-8 max-w-2xl">
        <h1 className="text-2xl">A few quick questions</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your answers will make the generated code much more precise.
        </p>

        <div className="mt-6 space-y-4">
          {loading ? (
            <>
              <Skeleton className="h-16" />
              <Skeleton className="h-12" />
            </>
          ) : error ? (
            <>
              <ErrorNote message={error} />
              <Button variant="secondary" onClick={run}>
                <RotateCcw className="size-4" />
                Try again
              </Button>
            </>
          ) : current ? (
            <Card className="space-y-4">
              <div className="flex items-center gap-1.5">
                {questions.map((q, i) => (
                  <span
                    key={q.id}
                    className={cn(
                      "h-1.5 flex-1 rounded-full",
                      i === index ? "bg-primary" : answers[q.id] ? "bg-success" : "bg-surface-2",
                    )}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Question {index + 1} of {questions.length}
              </p>

              <div className="flex gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft">
                  <Hammer className="size-3.5 text-primary" />
                </span>
                <p className="rounded-xl rounded-tl-none bg-surface-2 px-4 py-3 text-sm leading-relaxed">
                  {current.question}
                </p>
              </div>

              {current.type === "yesno" ? (
                <div className="flex gap-2">
                  {["Yes", "No"].map((option) => (
                    <Button
                      key={option}
                      variant={answers[current.id] === option ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => setAnswers((a) => ({ ...a, [current.id]: option }))}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
              ) : current.type === "select" && current.options?.length ? (
                <div className="flex flex-wrap gap-2">
                  {current.options.map((option) => (
                    <Button
                      key={option}
                      variant={answers[current.id] === option ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => setAnswers((a) => ({ ...a, [current.id]: option }))}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
              ) : (
                <Input
                  value={answers[current.id] ?? ""}
                  placeholder="Your answer"
                  onChange={(e) => setAnswers((a) => ({ ...a, [current.id]: e.target.value }))}
                />
              )}

              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={index === 0}
                  onClick={() => setIndex((i) => i - 1)}
                >
                  Back
                </Button>
                {index < questions.length - 1 ? (
                  <Button
                    size="sm"
                    disabled={!(answers[current.id] ?? "").trim()}
                    onClick={() => setIndex((i) => i + 1)}
                  >
                    Next
                    <ArrowRight className="size-3.5" />
                  </Button>
                ) : (
                  <Button size="sm" loading={submitting} disabled={!allAnswered} onClick={submit}>
                    Build my app
                    <ArrowRight className="size-3.5" />
                  </Button>
                )}
              </div>
            </Card>
          ) : (
            <Card className="space-y-4">
              <p className="text-sm text-muted-foreground">
                No clarifying questions needed — you're ready to build.
              </p>
              <Button loading={submitting} onClick={submit}>
                Build my app
                <ArrowRight className="size-4" />
              </Button>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
