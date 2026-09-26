import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PreviewPanel } from "@/components/forge/PreviewPanel";
import { ErrorNote, Spinner } from "@/components/forge/ui";
import { getProject } from "@/lib/projects.functions";

export const Route = createFileRoute("/preview/$id")({
  validateSearch: (search: Record<string, unknown>): { page?: string } =>
    typeof search["page"] === "string" ? { page: search["page"] } : {},
  head: () => ({
    meta: [
      { title: "App preview — Forge" },
      { name: "description", content: "Full-window desktop preview of your generated app." },
      { property: "og:title", content: "App preview — Forge" },
      { property: "og:description", content: "Full-window desktop preview of your generated app." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  ssr: false,
  component: FullPreviewPage,
});

function FullPreviewPage() {
  const { id } = Route.useParams();
  const { page } = Route.useSearch();
  const project = useQuery({ queryKey: ["project", id], queryFn: () => getProject({ data: { id } }) });

  if (project.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (project.isError || !project.data?.plan) {
    return (
      <div className="p-6">
        <ErrorNote message={project.isError ? (project.error as Error).message : "No plan for this project yet."} />
      </div>
    );
  }
  return (
    <div className="h-screen">
      <PreviewPanel
        files={project.data.files}
        pages={project.data.plan.pages}
        stackId={project.data.project.stack}
        initialPage={page}
        fullscreen
      />
    </div>
  );
}
