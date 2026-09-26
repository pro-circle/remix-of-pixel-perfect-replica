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

export const STACKS: StackOption[] = [
  {
    id: "react-express-supabase",
    name: "React + Express + Supabase",
    frontend: "React 18 + Vite",
    backend: "Express.js",
    database: "Supabase (PostgreSQL + Auth + Storage)",
    bestFor: "Rapid SaaS apps, real-time features",
    description:
      "Batteries-included: hosted Postgres, auth and storage with a thin Express layer for server logic.",
  },
  {
    id: "react-express-postgres",
    name: "React + Express + PostgreSQL",
    frontend: "React 18 + Vite",
    backend: "Express.js",
    database: "PostgreSQL (raw, pg driver)",
    bestFor: "Custom data models, full SQL control",
    description:
      "Own your schema and queries end to end with parameterised raw SQL and a connection pool.",
  },
  {
    id: "react-fastapi-supabase",
    name: "React + FastAPI + Supabase",
    frontend: "React 18 + Vite",
    backend: "FastAPI (Python)",
    database: "Supabase (PostgreSQL)",
    bestFor: "ML-adjacent apps, Python backends",
    description:
      "Python backend with pydantic validation, ideal when your logic lives in the Python ecosystem.",
  },
  {
    id: "react-fastapi-mongodb",
    name: "React + FastAPI + MongoDB",
    frontend: "React 18 + Vite",
    backend: "FastAPI (Python)",
    database: "MongoDB (Motor async driver)",
    bestFor: "Flexible schemas, document-heavy apps",
    description:
      "Document storage with async Motor and Beanie models for fast-moving, nested data.",
  },
  {
    id: "expo-supabase",
    name: "React Native + Expo + Supabase",
    frontend: "React Native + Expo",
    backend: "Supabase Edge Functions",
    database: "Supabase",
    bestFor: "Cross-platform mobile apps",
    description:
      "One codebase for iOS and Android with expo-router, NativeWind and Supabase auth.",
  },
];

export const stackById = (id: string | null | undefined) =>
  STACKS.find((s) => s.id === id) ?? null;

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
