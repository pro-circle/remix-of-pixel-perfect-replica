import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/forge/AppShell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Skeleton,
} from "@/components/forge/ui";
import { deleteProject, listProjects } from "@/lib/projects.functions";
import { STATUS_LABEL, stackById, type Project, type ProjectStatus } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Forge — build a full-stack app from a description" },
      {
        name: "description",
        content:
          "Describe your app, choose a stack, approve the blueprint and download a complete, runnable codebase.",
      },
      { property: "og:title", content: "Forge — build a full-stack app from a description" },
      {
        property: "og:description",
        content:
          "Describe your app, choose a stack, approve the blueprint and download a complete, runnable codebase.",
      },
    ],
  }),
  component: HomePage,
});

const STATUS_TONE: Record<ProjectStatus, "neutral" | "info" | "warning" | "primary" | "success"> = {
  DESCRIBING: "neutral",
  STACK: "neutral",
  PLANNING: "info",
  CLARIFYING: "warning",
  BUILDING: "primary",
  COMPLETE: "success",
};

function continueTo(project: Project) {
  switch (project.status) {
    case "COMPLETE":
      return `/project/${project.id}/export`;
    case "BUILDING":
      return `/project/${project.id}/build`;
    case "CLARIFYING":
      return `/project/${project.id}/clarify`;
    case "PLANNING":
      return `/project/${project.id}/plan`;
    default:
      return `/project/${project.id}/stack`;
  }
}

function HomePage() {
  const queryClient = useQueryClient();
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => listProjects(),
    retry: false,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteProject({ data: { id } }),
    onSuccess: () => {
      toast.success("Project deleted");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: () => toast.error("Could not delete that project"),
  });

  return (
    <AppShell>
      <section className="fade-in-up">
        <h1 className="text-3xl">What will you build today?</h1>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Describe your idea, pick a stack, review the blueprint. Forge writes the full project and
          hands you a runnable ZIP.
        </p>
        <div className="mt-6">
          <Link to="/new">
            <Button>
              <Plus className="size-4" />
              New project
            </Button>
          </Link>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Recent projects
        </h2>
        <div className="mt-4">
          {projects.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          ) : projects.isError ? (
            <ErrorNote
              message={
                (projects.error as Error).message.includes("Supabase is not configured")
                  ? "Add your Supabase URL and service role key to the .env file, then restart the dev server."
                  : (projects.error as Error).message
              }
            />
          ) : projects.data && projects.data.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.data.map((project) => (
                <Card key={project.id} className="fade-in-up flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold">{project.name ?? "Untitled project"}</h3>
                    <Badge tone={STATUS_TONE[project.status]}>{STATUS_LABEL[project.status]}</Badge>
                  </div>
                  <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {project.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {project.stack ? (
                      <Badge tone="info">{stackById(project.stack)?.name ?? project.stack}</Badge>
                    ) : null}
                    <span>{new Date(project.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-auto flex items-center gap-2">
                    <Link to={continueTo(project)} className="flex-1">
                      <Button variant="secondary" size="sm" className="w-full">
                        {project.status === "COMPLETE" ? "View" : "Continue"}
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove.mutate(project.id)}
                      aria-label="Delete project"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No projects yet"
              description="Your generated apps will show up here once you describe your first idea."
              action={
                <Link to="/new">
                  <Button>
                    <Plus className="size-4" />
                    New project
                  </Button>
                </Link>
              }
            />
          )}
        </div>
      </section>
    </AppShell>
  );
}
