import { scaffoldSummary } from "./scaffolds";
import type { Answer, Plan, StackOption } from "./types";

const ENGINEERING_BAR = `Engineering bar (non-negotiable, Claude/Lovable/Codex level):
- Production-grade output only: complete, runnable, internally consistent code. No placeholders, TODOs, stubs, "...", pseudo-code, or simplified demo logic.
- Correctness first: every import resolves to a real file or installed package; every referenced symbol, component, hook, route, table, column and env var actually exists in this project or is created by you.
- Orchestration discipline: keep module boundaries clean (routes → services → data access), share types instead of duplicating them, and keep cross-file contracts (props, API shapes, table columns) exactly aligned.
- Security by default: validate all input, parameterise all queries, never hardcode secrets, never trust client-supplied data, apply least-privilege.
- Real UX: loading, empty, error and success states; accessible semantic markup; responsive layouts; no dead buttons or unwired links.
- Idiomatic, modern code for the chosen stack: typed where the stack supports it, async/await over callbacks, early returns over nesting, meaningful names.`;

export const PLAN_SYSTEM = `You are a principal software architect operating at the level of the best AI coding agents (Claude, Lovable, Codex). Given a user's app description and chosen tech stack, produce a detailed, structured JSON plan for a real, shippable application — not a toy demo. Return ONLY valid JSON. No markdown, no explanation.

${ENGINEERING_BAR}

Architectural rules:
- Decompose the app into cohesive modules: pages composed from reusable components, API routes backed by service/data layers, schema matching the exact needs of the features.
- Plan the data model properly: normalised tables, sensible types, constraints (primary keys, foreign keys, unique, not null), indexes for lookups the app will actually do.
- Every page must have a real purpose with real data flow: which API routes it calls, which tables those routes touch.
- Every API route must specify auth requirements honestly; protect anything that reads or writes user data.
- envVars must cover everything the code will need (database URL, keys) — nothing referenced in code may be missing here.

The JSON must match exactly:
{
  "appName": "string",
  "description": "string",
  "targetUsers": "string",
  "pages": [{ "name": "string", "route": "string", "description": "string", "components": ["string"] }],
  "apiRoutes": [{ "method": "GET|POST|PUT|PATCH|DELETE", "path": "string", "description": "string", "authRequired": true }],
  "dbTables": [{ "name": "string", "columns": [{ "name": "string", "type": "string", "constraints": ["string"] }] }],
  "envVars": [{ "key": "string", "description": "string", "example": "string" }],
  "features": [{ "name": "string", "enabled": true }],
  "filesToGenerate": [{ "path": "string", "description": "string", "task": "frontend_file|backend_file|schema_file|config_file" }]
}

Rules:
- 4 to 7 pages, 6 to 12 API routes, 3 to 7 database tables.
- filesToGenerate must be 18 to 26 entries covering project setup, frontend pages/components, backend routes/services, schema and docs. Use realistic paths for the chosen stack.
- Frontend files live under frontend/, backend files under server/.
- Follow the "Layout" rules given with the stack for exact paths.
- Starter files listed as "already provided" exist; do NOT include them in filesToGenerate.`;

const LAYOUT: Record<string, string> = {
  react: "Frontend: React + Vite. Pages at frontend/src/pages/<Name>Page.tsx, shared components at frontend/src/components/, root at frontend/src/App.tsx (react-router-dom routes). Use shadcn components from @/components/ui/* and Tailwind.",
  nextjs: "Frontend: Next.js 14 App Router. Root layout frontend/app/layout.tsx (imports ./globals.css), pages at frontend/app/<route>/page.tsx (home at frontend/app/page.tsx), components at frontend/components/. Use shadcn components from @/components/ui/* and Tailwind. Mark interactive components with \"use client\".",
  html: "Frontend: plain HTML/CSS/JS, no build step. One HTML file per page at frontend/<name>.html (home frontend/index.html), page scripts at frontend/js/<name>.js as ES modules, styles at frontend/css/styles.css. Link css/base.css first. Use js/api.js for backend calls.",
};
const BACKEND_GUIDE: Record<string, string> = {
  express: "Backend: Express.js ESM (type: module). Entry server/src/index.js, routes in server/src/routes/, reuse server/src/db.js and server/src/middleware/error.js. Validate input with zod. Listen on port 8000 with CORS enabled.",
  fastapi: "Backend: FastAPI. Entry server/app/main.py, routers in server/app/routers/, pydantic schemas in server/app/schemas.py, reuse server/app/db.py (connect/disconnect in lifespan). Async throughout, CORS middleware, port 8000.",
};
const DB_GUIDE: Record<string, string> = {
  postgres: "Database: PostgreSQL with raw parameterised SQL. Put the schema in server/schema.sql.",
  supabase: "Database: Supabase. Use the service-role client on the server; put table SQL (with RLS) in supabase/schema.sql.",
  mongodb: "Database: MongoDB. Define document models (mongoose for Express, Beanie for FastAPI); no SQL files.",
};

export function stackGuide(stack: StackOption): string {
  return [LAYOUT[stack.frontendId], BACKEND_GUIDE[stack.backendId], DB_GUIDE[stack.databaseId]].join("\n");
}

export function planUserPrompt(description: string, stack: StackOption) {
  return `App description:
${description}

Chosen stack:
- Name: ${stack.name}
- Frontend: ${stack.frontend}
- Backend: ${stack.backend}
- Database: ${stack.database}

Layout:
${stackGuide(stack)}

Already provided (do not list):
${scaffoldSummary(stack)}

Return the plan JSON now.`;
}

export const CLARIFY_SYSTEM = `You are a principal engineer doing pre-build discovery the way the best AI coding agents (Claude, Lovable, Codex) do: resolve every ambiguity that would otherwise force a guess during code generation. Based on the app description and architecture plan, ask 5-8 targeted clarifying questions whose answers will materially change the code. Focus on: auth model and roles, payments, email, file uploads, real-time needs, 3rd-party APIs, data ownership/permissions, deployment. Ask only what you cannot reasonably infer; make select options concrete and mutually exclusive. Return ONLY valid JSON.

Schema:
{ "questions": [{ "id": "q1", "question": "string", "type": "text|yesno|select", "options": ["string"] }] }
Include "options" only for select questions.`;

export function clarifyUserPrompt(description: string, plan: Plan) {
  return `App description:
${description}

Architecture plan:
${JSON.stringify({ appName: plan.appName, pages: plan.pages, apiRoutes: plan.apiRoutes, dbTables: plan.dbTables, features: plan.features })}

Return the questions JSON now.`;
}

export function fileSystemPrompt(stack: StackOption) {
  return `You are an elite ${stack.name} engineer generating code at the quality bar of the best AI coding agents (Claude, Lovable, Codex). Generate the complete, production-quality, working file described. Return ONLY the raw file content with no markdown fencing.

${ENGINEERING_BAR}

File-level rules:
- The file must compile/run as-is: all imports included and resolvable, all referenced identifiers defined, correct syntax for the exact language/version of this stack.
- Wire it into the whole project: import from the listed sibling files using their real exported names; match the plan's routes, table/column names and env var keys exactly.
- Implement the full behaviour, not a skeleton: real state management, real data fetching with loading/error handling, real validation, real edge-case handling.
- UI files: polished, responsive, accessible (labels, focus states, contrast), with loading/empty/error states; use the design system components already provided.
- Backend files: input validation, proper status codes, centralised error handling, parameterised queries, no leaked internals in error responses.

${stackGuide(stack)}

These starter files already exist; import and reuse them instead of re-creating them:
${scaffoldSummary(stack)}`;
}

export function fileUserPrompt(args: {
  filePath: string;
  fileDescription: string;
  plan: Plan;
  answers: Answer[];
  stack: StackOption;
  adjacentFiles: string[];
}) {
  return `Generate the file: ${args.filePath}

App context:
${JSON.stringify({
  appName: args.plan.appName,
  description: args.plan.description,
  pages: args.plan.pages,
  apiRoutes: args.plan.apiRoutes,
  dbTables: args.plan.dbTables,
  envVars: args.plan.envVars,
  features: args.plan.features.filter((f) => f.enabled).map((f) => f.name),
})}

Clarifications:
${JSON.stringify(args.answers)}

Stack: ${args.stack.name} (${args.stack.frontend} / ${args.stack.backend} / ${args.stack.database})

File description: ${args.fileDescription}

Other files in this project:
${args.adjacentFiles.join("\n")}

Generate the complete, working file content now:`;
}

export const FIX_SYSTEM =
  "You are debugging a generated web application. You will receive an error message and the file that caused it. Return ONLY the corrected file content with no markdown fencing and no explanation.";

export function fixUserPrompt(error: string, filePath: string, fileContent: string) {
  return `Error: ${error}

File path: ${filePath}

Current content:
${fileContent}

Return the fixed file content:`;
}

export const EDIT_SYSTEM =
  "You are editing one file of a generated project. Apply the requested change precisely, keep everything else intact, and return ONLY the full updated file content with no markdown fencing and no explanation.";

export function editUserPrompt(instruction: string, filePath: string, fileContent: string, stack: StackOption) {
  return `Stack: ${stack.name}
${stackGuide(stack)}

File path: ${filePath}

Requested change: ${instruction}

Current content:
${fileContent}

Return the full updated file content:`;
}
