import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, Check, Copy, Eye } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/forge/AppShell";
import { FileTree } from "@/components/forge/FileTree";
import { PreviewPanel } from "@/components/forge/PreviewPanel";
import { Button, Card, ErrorNote, Modal, Skeleton, Stepper } from "@/components/forge/ui";
import { getProject } from "@/lib/projects.functions";
import { stackById, type GeneratedFile, type Plan } from "@/lib/types";

export const Route = createFileRoute("/project/$id/export")({
  head: () => ({
    meta: [
      { title: "Your app is ready — Forge" },
      { name: "description", content: "Download your generated project as a runnable ZIP." },
      { property: "og:title", content: "Your app is ready — Forge" },
      {
        property: "og:description",
        content: "Download your generated project as a runnable ZIP.",
      },
    ],
  }),
  component: ExportPage,
});

function readme(plan: Plan, stackName: string) {
  return `# ${plan.appName}

${plan.description}

**Target users:** ${plan.targetUsers}

## Stack

${stackName}

## Prerequisites

- Node.js 20+
${stackName.includes("FastAPI") ? "- Python 3.11+\n" : ""}
## Installation

1. Unzip the project and open a terminal in its folder.
2. Install frontend dependencies: \`cd frontend && npm install\`
3. Install backend dependencies: ${
    stackName.includes("FastAPI")
      ? "`cd ../server && pip install -r requirements.txt`"
      : "`cd ../server && npm install`"
  }
4. Copy \`.env.example\` to \`.env\` and fill in the values below.

## Environment variables

| Key | Description | Example |
| --- | --- | --- |
${plan.envVars.map((v) => `| \`${v.key}\` | ${v.description} | \`${v.example}\` |`).join("\n")}

## Run locally

- Backend: ${stackName.includes("FastAPI") ? "`uvicorn main:app --reload --port 3001`" : "`npm run dev` (port 3001)"}
- Frontend: \`npm run dev\` (port 5173)

## Database

Run the SQL in \`schema/\` against your database before first use.

## Pages

${plan.pages.map((p) => `- **${p.name}** (\`${p.route}\`) — ${p.description}`).join("\n")}

## API

${plan.apiRoutes.map((r) => `- \`${r.method} ${r.path}\` — ${r.description}${r.authRequired ? " (auth required)" : ""}`).join("\n")}
`;
}

function envExample(plan: Plan) {
  return plan.envVars.map((v) => `# ${v.description}\n${v.key}=${v.example}`).join("\n\n") + "\n";
}

function deployGuide(stackName: string) {
  const backend = stackName.includes("FastAPI") ? "Render" : "Railway";
  return `# Deployment guide

## Frontend (Vercel)

1. Push this project to GitHub.
2. In Vercel, "New Project" and import the repo; set the root directory to \`frontend\`.
3. Build command \`npm run build\`, output directory \`dist\`.
4. Add the \`VITE_*\` environment variables in Project Settings → Environment Variables.
5. Deploy.

## Backend (${backend})

1. Create a new service from the same repo and set the root directory to \`server\`.
2. Start command: ${stackName.includes("FastAPI") ? "`uvicorn main:app --host 0.0.0.0 --port $PORT`" : "`npm start`"}
3. Add every server environment variable from \`.env.example\`.
4. Copy the public service URL into the frontend's \`VITE_API_URL\`.

## Database

${
  stackName.includes("Supabase")
    ? "1. Create a Supabase project.\n2. Run the SQL in `schema/` in the SQL editor.\n3. Copy the project URL, anon key and service role key into your env files."
    : stackName.includes("MongoDB")
      ? "1. Create a MongoDB Atlas cluster.\n2. Whitelist your backend host.\n3. Copy the connection string into `MONGODB_URI`."
      : `1. Add a PostgreSQL database on ${backend}.\n2. Run the SQL in \`schema/\`.\n3. Copy the connection string into \`DATABASE_URL\`.`
}

## Custom domain

Add the domain in Vercel (frontend) and, if you expose the API publicly, on ${backend}. Update CORS origins accordingly.

## Health check

Expose \`GET /api/health\` returning \`{ "status": "ok" }\` and point your host's health check at it.
`;
}

function ExportPage() {
  const { id } = Route.useParams();
  const project = useQuery({
    queryKey: ["project", id],
    queryFn: () => getProject({ data: { id } }),
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [zipping, setZipping] = useState(false);

  const files: GeneratedFile[] = project.data?.files ?? [];
  const plan = project.data?.plan ?? null;
  const stackName = stackById(project.data?.project.stack)?.name ?? "Custom stack";
  const totalBytes = files.reduce((sum, f) => sum + f.content.length, 0);

  async function download() {
    if (!plan) return;
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (const file of files) zip.file(file.file_path, file.content);
      if (!files.some((f) => f.file_path.toLowerCase() === "readme.md"))
        zip.file("README.md", readme(plan, stackName));
      if (!files.some((f) => f.file_path.includes(".env.example")))
        zip.file(".env.example", envExample(plan));
      zip.file("DEPLOY.md", deployGuide(stackName));

      const blob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${plan.appName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch (e) {
      toast.error(`Could not build the ZIP: ${(e as Error).message}`);
    } finally {
      setZipping(false);
    }
  }

  async function copyFile(path: string) {
    const file = files.find((f) => f.file_path === path);
    if (!file) return;
    await navigator.clipboard.writeText(file.content);
    toast.success(`Copied ${path}`);
  }

  if (project.isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-96" />
      </AppShell>
    );
  }

  if (project.isError || !plan) {
    return (
      <AppShell>
        <ErrorNote
          message={
            project.isError ? (project.error as Error).message : "This project has no plan yet."
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Stepper current={6} />
      <div className="fade-in-up mt-8">
        <h1 className="text-2xl">Your app is ready</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {files.length} files · {(totalBytes / 1024).toFixed(0)} KB · {stackName}
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Project files</h2>
            <FileTree paths={files.map((f) => f.file_path)} onSelect={copyFile} />
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Copy className="size-3" />
              Click a file to copy its contents
            </p>
          </Card>

          <div className="space-y-4">
            <Card className="space-y-3">
              <Archive className="size-5 text-primary" />
              <div>
                <h3 className="text-sm font-semibold">Download project</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Complete source code, schema, README and deploy guide.
                </p>
              </div>
              <Button loading={zipping} onClick={download}>
                Download .zip
              </Button>
            </Card>

            <Card className="space-y-3">
              <Eye className="size-5 text-primary" />
              <div>
                <h3 className="text-sm font-semibold">Open full preview</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Run the generated frontend in a full-screen sandbox.
                </p>
              </div>
              <Button variant="secondary" onClick={() => setPreviewOpen(true)}>
                Launch preview
              </Button>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold">What's inside</h3>
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                {[
                  "Full source code (frontend + backend)",
                  "README with setup instructions",
                  ".env.example with all required keys",
                  "Database schema / migration files",
                  "Deployment guide (Vercel, Railway, Supabase)",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="size-3.5 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>

        <div className="mt-8">
          <Link to="/new" className="text-sm text-primary hover:underline">
            Start a new project
          </Link>
        </div>
      </div>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={plan.appName}>
        <div className="h-full p-4">
          <PreviewPanel files={files} pages={plan.pages} />
        </div>
      </Modal>
    </AppShell>
  );
}
