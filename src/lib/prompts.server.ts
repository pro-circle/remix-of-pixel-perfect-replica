import type { Answer, Plan, StackOption } from "./types";

export const PLAN_SYSTEM = `You are a senior software architect. Given a user's app description and chosen tech stack, generate a detailed, structured JSON plan for building their application. Return ONLY valid JSON. No markdown, no explanation.

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
- Frontend page components live under frontend/src/pages/<Name>.tsx.`;

export function planUserPrompt(description: string, stack: StackOption) {
  return `App description:
${description}

Chosen stack:
- Name: ${stack.name}
- Frontend: ${stack.frontend}
- Backend: ${stack.backend}
- Database: ${stack.database}

Return the plan JSON now.`;
}

export const CLARIFY_SYSTEM = `You are a senior engineer doing a pre-build discovery. Based on the app description and architecture plan, ask 5-8 targeted clarifying questions that will meaningfully improve code generation. Focus on: auth, roles, payments, email, uploads, real-time, 3rd-party APIs, deployment. Return ONLY valid JSON.

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

const STACK_GUIDANCE: Record<string, string> = {
  "react-express-supabase":
    "Use @supabase/supabase-js for DB operations. Use the Supabase client on the frontend (auth, realtime) and on the backend (DB queries via service role key). Use React Query for data fetching. Include proper TypeScript types.",
  "react-express-postgres":
    "Use the 'pg' npm package (Pool) for all DB operations. Write raw parameterised SQL. Include a db.js connection pool file and proper error handling.",
  "react-fastapi-supabase":
    "Backend is Python FastAPI. Use supabase-py for DB. Use pydantic models for request/response validation. Include CORS middleware. Use async/await throughout.",
  "react-fastapi-mongodb":
    "Backend is Python FastAPI. Use Motor (async MongoDB driver) with Beanie ODM models. Include an async context manager for the DB connection and pydantic validation.",
  "expo-supabase":
    "Frontend is React Native with Expo SDK 51+. Use @supabase/supabase-js with AsyncStorage for auth persistence. Use NativeWind for styling. All navigation via expo-router.",
};

export function fileSystemPrompt(stack: StackOption) {
  return `You are a senior ${stack.name} developer. Generate production-quality, complete, working code for the file described. No placeholders. No TODOs. Include all imports. Use modern best practices. Return ONLY the raw file content with no markdown fencing.

Stack guidance: ${STACK_GUIDANCE[stack.id] ?? ""}`;
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
  "You are debugging a React application. You will receive an error message and the file that caused it. Return ONLY the corrected file content with no markdown fencing and no explanation.";

export function fixUserPrompt(error: string, filePath: string, fileContent: string) {
  return `Error: ${error}

File path: ${filePath}

Current content:
${fileContent}

Return the fixed file content:`;
}
