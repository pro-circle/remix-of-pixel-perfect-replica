# Forge — AI full-stack app generator

Describe an app, pick a stack, review the blueprint, answer a few questions, and Forge writes a
complete project you can download as a ZIP — with a live frontend preview while it builds.

## What you need

- Node.js 20+ (or Bun)
- A Supabase project (for storing your projects, plans and generated files)
- 1–8 Groq API keys (rotated round-robin across requests)

## 1. Create the database tables

Open your Supabase project → SQL Editor → paste the contents of `schema/migrations.sql` → Run.

## 2. Add your keys

Fill in `.env` in the project root:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

GROQ_KEY_1=
GROQ_KEY_2=
GROQ_KEY_3=
GROQ_KEY_4=
GROQ_KEY_5=
GROQ_KEY_6=
GROQ_KEY_7=
GROQ_KEY_8=

FORGE_USERNAME=user
FORGE_PASSWORD=12345678
SESSION_SECRET=a-long-random-string
```

`.env` is git-ignored. Only the server reads these values; none of them reach the browser.

## 3. Run it locally

```bash
bun install      # or: npm install
bun run dev      # or: npm run dev
```

Open http://localhost:8080 and sign in with the demo credentials (`user` / `12345678`, or whatever
you set in `.env`).

To build for production: `bun run build`, then `bun run preview`.

## How the flow works

1. **Describe** — 50–2000 characters about your app.
2. **Stack** — five presets (React/Express/Supabase, React/Express/Postgres,
   React/FastAPI/Supabase, React/FastAPI/MongoDB, Expo/Supabase).
3. **Plan** — an AI blueprint (pages, API routes, tables, env vars, features, file manifest) that
   you can edit inline before approving.
4. **Clarify** — 5–8 generated questions about auth, roles, payments, uploads, deployment.
5. **Build** — files are generated in batches (setup → frontend → backend → schema/docs), each one
   appearing on the timeline and streaming into the Sandpack preview. Failed files retry once and
   can be retried manually; refreshing mid-build lets you resume.
6. **Export** — file tree, ZIP download (source + README + `.env.example` + DEPLOY.md), and a
   full-screen preview.

## Notes

- Everything server-side runs as TanStack Start server functions, so there is no separate Node
  process to keep alive.
- Groq keys rotate per request; a rate-limited or rejected key is skipped automatically.
- Models are routed by task: planning and code generation use `openai/gpt-oss-120b`, light config
  files use `openai/gpt-oss-20b`, preview fixes use `qwen/qwen3-32b`.
