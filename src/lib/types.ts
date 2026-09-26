export type ProjectStatus =
  | "DESCRIBING"
  | "STACK"
  | "PLANNING"
  | "CLARIFYING"
  | "BUILDING"
  | "COMPLETE";

export type Project = {
  id: string;
  name: string | null;
  description: string;
  stack: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
};

export type PlanPage = {
  name: string;
  route: string;
  description: string;
  components: string[];
};

export type PlanApiRoute = {
  method: string;
  path: string;
  description: string;
  authRequired: boolean;
};

export type PlanColumn = { name: string; type: string; constraints: string[] };
export type PlanTable = { name: string; columns: PlanColumn[] };
export type PlanEnvVar = { key: string; description: string; example: string };
export type PlanFeature = { name: string; enabled: boolean };
export type PlanFile = {
  path: string;
  description: string;
  task: "frontend_file" | "backend_file" | "schema_file" | "config_file";
};

export type Plan = {
  appName: string;
  description: string;
  targetUsers: string;
  pages: PlanPage[];
  apiRoutes: PlanApiRoute[];
  dbTables: PlanTable[];
  envVars: PlanEnvVar[];
  features: PlanFeature[];
  filesToGenerate: PlanFile[];
};

export type Question = {
  id: string;
  question: string;
  type: "text" | "yesno" | "select";
  options?: string[];
};

export type Answer = { id: string; question: string; answer: string };

export type GeneratedFile = {
  file_path: string;
  content: string;
  language: string | null;
};

export type StackOption = {
  id: string;
  name: string;
  frontend: string;
  backend: string;
  database: string;
  bestFor: string;
  description: string;
};

export type StackPart = { id: string; name: string; detail: string; blurb: string };

export const FRONTENDS: StackPart[] = [
  { id: "react", name: "React.js", detail: "React 18 + Vite + Tailwind + shadcn/ui", blurb: "Single-page app with fast dev server and component library." },
  { id: "nextjs", name: "Next.js", detail: "Next.js 14 App Router + Tailwind + shadcn/ui", blurb: "File-based routing, server components and SEO out of the box." },
  { id: "html", name: "HTML, CSS, JS", detail: "Plain HTML5, CSS3 and vanilla JavaScript", blurb: "No build step. Lightweight pages that run anywhere." },
];

export const BACKENDS: StackPart[] = [
  { id: "express", name: "Express.js", detail: "Express.js (Node 20)", blurb: "Minimal, flexible Node server with a huge ecosystem." },
  { id: "fastapi", name: "FastAPI", detail: "FastAPI (Python 3.11)", blurb: "Typed Python APIs with automatic docs and pydantic validation." },
];

export const DATABASES: StackPart[] = [
  { id: "postgres", name: "PostgreSQL", detail: "PostgreSQL (raw SQL)", blurb: "Full SQL control with your own schema and queries." },
  { id: "supabase", name: "Supabase", detail: "Supabase (PostgreSQL + Auth + Storage)", blurb: "Hosted Postgres with auth, storage and realtime." },
  { id: "mongodb", name: "MongoDB", detail: "MongoDB (document store)", blurb: "Flexible JSON documents for fast-changing data." },
];

export type StackOption = {
  id: string;
  name: string;
  frontend: string;
  backend: string;
  database: string;
  frontendId: string;
  backendId: string;
  databaseId: string;
};

const LEGACY: Record<string, string> = {
  "react-express-supabase": "react|express|supabase",
  "react-express-postgres": "react|express|postgres",
  "react-fastapi-supabase": "react|fastapi|supabase",
  "react-fastapi-mongodb": "react|fastapi|mongodb",
  "expo-supabase": "react|express|supabase",
};

export const makeStackId = (fe: string, be: string, db: string) => `${fe}|${be}|${db}`;

export function stackById(id: string | null | undefined): StackOption | null {
  if (!id) return null;
  const [fe, be, db] = (LEGACY[id] ?? id).split("|");
  const f = FRONTENDS.find((x) => x.id === fe);
  const b = BACKENDS.find((x) => x.id === be);
  const d = DATABASES.find((x) => x.id === db);
  if (!f || !b || !d) return null;
  return {
    id: makeStackId(f.id, b.id, d.id),
    name: `${f.name} + ${b.name} + ${d.name}`,
    frontend: f.detail,
    backend: b.detail,
    database: d.detail,
    frontendId: f.id,
    backendId: b.id,
    databaseId: d.id,
  };
}

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  DESCRIBING: "Describing",
  STACK: "Stack",
  PLANNING: "Planning",
  CLARIFYING: "Clarifying",
  BUILDING: "Building",
  COMPLETE: "Complete",
};

export function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    py: "python",
    sql: "sql",
    md: "markdown",
    css: "css",
    html: "html",
    yml: "yaml",
    yaml: "yaml",
  };
  return map[ext] ?? "text";
}
