import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Play, RotateCcw } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { WideShell } from "@/components/forge/AppShell";
import { CodeWorkspace } from "@/components/forge/CodeWorkspace";
import { PreviewPanel } from "@/components/forge/PreviewPanel";
import { Timeline, type TimelineNode } from "@/components/forge/Timeline";
import { Button, Card, ErrorNote, Progress, Skeleton, Stepper } from "@/components/forge/ui";
import { finishBuild, fixFile, generateFile, getProject } from "@/lib/projects.functions";
import type { GeneratedFile, PlanFile } from "@/lib/types";

export const Route = createFileRoute("/project/$id/build")({
  head: () => ({
    meta: [
      { title: "Building your app — Forge" },
      { name: "description", content: "Watch Forge write every file of your project, live." },
      { property: "og:title", content: "Building your app — Forge" },
      { property: "og:description", content: "Watch Forge write every file of your project, live." },
    ],
  }),
  component: BuildPage,
});

function groupFor(file: PlanFile): string {
  const p = file.path.toLowerCase();
  if (/package\.json|vite\.config|tsconfig|tailwind|postcss|index\.html|requirements/.test(p))
    return "Project setup";
  if (/\.sql$|schema|migration|models\.py/.test(p)) return "Schema";
  if (/readme|deploy|\.env/.test(p)) return "Docs & config";
  if (file.task === "backend_file") {
    if (/route/.test(p)) return "Backend — routes";
    if (/db|database|model/.test(p)) return "Backend — database";
    return "Backend — server";
  }
  if (/\/pages\//.test(p)) return "Frontend — pages";
  if (/\/components\//.test(p)) return "Frontend — components";
  if (/api|hook|lib|store/.test(p)) return "Frontend — data layer";
  return "Frontend — layout";
}

function batchesFor(files: PlanFile[]): PlanFile[][] {
  const setup = files.filter((f) => groupFor(f) === "Project setup");
  const frontend = files.filter(
    (f) => f.task === "frontend_file" && groupFor(f) !== "Project setup",
  );
  const backend = files.filter((f) => f.task === "backend_file" && groupFor(f) !== "Project setup");
  const last = files.filter(
    (f) => !setup.includes(f) && !frontend.includes(f) && !backend.includes(f),
  );
  return [setup, frontend, backend, last].filter((b) => b.length > 0);
}

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]!;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function BuildPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const project = useQuery({
    queryKey: ["project", id],
    queryFn: () => getProject({ data: { id } }),
  });

  const [nodes, setNodes] = useState<TimelineNode[] | null>(null);
  const [files, setFiles] = useState<GeneratedFile[] | null>(null);
  const [running, setRunning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const cancelled = useRef(false);

  const plan = project.data?.plan ?? null;
  const existingFiles = project.data?.files ?? [];
  const currentFiles = files ?? existingFiles;

  const manifest = useMemo(() => plan?.filesToGenerate ?? [], [plan]);

  const initNodes = useCallback(
    (keepDone: boolean) =>
      manifest.map<TimelineNode>((file) => {
        const existing = existingFiles.find((f) => f.file_path === file.path);
        return {
          path: file.path,
          description: file.description,
          group: groupFor(file),
          status: keepDone && existing ? "DONE" : "PENDING",
          content: existing?.content,
        };
      }),
    [manifest, existingFiles],
  );

  const update = (path: string, patch: Partial<TimelineNode>) =>
    setNodes((prev) =>
      (prev ?? []).map((node) => (node.path === path ? { ...node, ...patch } : node)),
    );

  async function build(mode: "fresh" | "resume" | "failed") {
    if (!plan) return;
    const base = nodes ?? initNodes(mode !== "fresh");
    setNodes(base);
    setRunning(true);
    setStartedAt(Date.now());
    cancelled.current = false;

    const doneSet = new Set(
      mode === "fresh" ? [] : base.filter((n) => n.status === "DONE").map((n) => n.path),
    );
    const failedOnly = mode === "failed" ? new Set(base.filter((n) => n.status === "ERROR").map((n) => n.path)) : null;

    const generated: GeneratedFile[] = [...(files ?? existingFiles)];

    const runOne = async (file: PlanFile) => {
      if (cancelled.current) return;
      if (doneSet.has(file.path)) return;
      if (failedOnly && !failedOnly.has(file.path)) return;

      update(file.path, { status: "IN_PROGRESS", error: undefined });
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await generateFile({
            data: { id, path: file.path, description: file.description, task: file.task },
          });
          generated.push({
            file_path: result.path,
            content: result.content,
            language: result.language,
          });
          setFiles([...generated]);
          update(file.path, { status: "DONE", content: result.content });
          return;
        } catch (e) {
          if (attempt === 1) {
            update(file.path, { status: "ERROR", error: (e as Error).message });
          }
        }
      }
    };

    try {
      for (const batch of batchesFor(manifest)) {
        await runPool(batch, 3, runOne);
      }
      const failed = (nodes ?? base).filter((n) => n.status === "ERROR").length;
      await finishBuild({ data: { id } });
      toast.success(failed > 0 ? `Build finished with ${failed} failed files` : "Build complete");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function autoFix(errorMessage: string) {
    const target =
      currentFiles.find((f) => errorMessage.includes(f.file_path.split("/").pop() ?? "")) ??
      currentFiles.find((f) => /App\.(tsx|jsx)$/.test(f.file_path));
    if (!target) {
      toast.error("Could not tell which file to fix");
      return;
    }
    setFixing(true);
    try {
      const { fixedContent } = await fixFile({
        data: {
          id,
          filePath: target.file_path,
          fileContent: target.content,
          error: errorMessage,
        },
      });
      setFiles(
        currentFiles.map((f) =>
          f.file_path === target.file_path ? { ...f, content: fixedContent } : f,
        ),
      );
      update(target.file_path, { content: fixedContent, status: "DONE" });
      toast.success(`Patched ${target.file_path}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setFixing(false);
    }
  }

  const list = nodes ?? initNodes(true);
  const done = list.filter((n) => n.status === "DONE").length;
  const failedCount = list.filter((n) => n.status === "ERROR").length;
  const totalLines = currentFiles.reduce((sum, f) => sum + f.content.split("\n").length, 0);
  const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  const remaining =
    running && done > 0 ? Math.max(0, ((elapsed / done) * (list.length - done)) / 60) : null;

  if (project.isLoading) {
    return (
      <WideShell>
        <Skeleton className="h-[70vh]" />
      </WideShell>
    );
  }

  if (project.isError || !plan) {
    return (
      <WideShell>
        <ErrorNote
          message={
            project.isError
              ? (project.error as Error).message
              : "This project has no approved plan yet."
          }
        />
      </WideShell>
    );
  }

  return (
    <WideShell>
      <Stepper current={5} />
      <div className="mt-6 grid items-stretch gap-6 lg:grid-cols-[minmax(20rem,2fr)_minmax(0,3fr)]">
        <Card className="flex max-h-[78vh] flex-col">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg">Building your app</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {done} of {list.length} files · {totalLines} lines
                {remaining !== null ? ` · ~${remaining.toFixed(1)} min remaining` : ""}
              </p>
            </div>
            {!running ? (
              done === 0 ? (
                <Button size="sm" onClick={() => build("fresh")}>
                  <Play className="size-3.5" />
                  Start build
                </Button>
              ) : done < list.length ? (
                <Button size="sm" onClick={() => build("resume")}>
                  <Play className="size-3.5" />
                  Resume build
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => navigate({ to: "/project/$id/export", params: { id } })}
                >
                  Export
                  <ArrowRight className="size-3.5" />
                </Button>
              )
            ) : null}
          </div>

          <div className="mt-4">
            <Progress value={(done / Math.max(1, list.length)) * 100} />
          </div>

          <div className="mt-5 min-h-0 flex-1 overflow-auto pr-1">
            <Timeline nodes={list} />
          </div>

          {failedCount > 0 && !running ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive-soft px-3 py-2">
              <p className="text-xs text-destructive">{failedCount} files failed</p>
              <Button variant="secondary" size="sm" onClick={() => build("failed")}>
                <RotateCcw className="size-3.5" />
                Retry failed files
              </Button>
            </div>
          ) : null}

          {!running && done > 0 ? (
            <div className="mt-4 flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate({ to: "/project/$id/export", params: { id } })}
              >
                Go to export
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          ) : null}
        </Card>

        <div className="flex min-h-[42rem] min-w-0 flex-col gap-3 lg:h-[78vh] lg:min-h-0">
          <div className="flex gap-1">
            {(["preview", "code"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={
                  tab === t
                    ? "rounded-md bg-primary-soft px-3 py-1 text-xs font-medium text-primary"
                    : "rounded-md px-3 py-1 text-xs text-muted-foreground hover:bg-surface-2"
                }
              >
                {t === "preview" ? "Preview" : "Code"}
              </button>
            ))}
          </div>
          <div className="min-h-0 min-w-0 flex-1">
            {tab === "preview" ? (
              <PreviewPanel
                files={currentFiles}
                pages={plan.pages}
                stackId={project.data?.project.stack}
                projectId={id}
                onAutoFix={autoFix}
                fixing={fixing}
              />
            ) : (
              <CodeWorkspace
                projectId={id}
                files={currentFiles}
                onChange={(path, content) => {
                  setFiles(currentFiles.map((f) => (f.file_path === path ? { ...f, content } : f)));
                  update(path, { content });
                }}
              />
            )}
          </div>
        </div>
      </div>
    </WideShell>
  );
}
