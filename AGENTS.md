<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules

- Forge has no Lovable Cloud backend: Supabase is reached with `SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` from `.env` through `src/lib/supabase.server.ts`, because the user
  manages their own Supabase project and seeds demo data there.
- All server work runs in `createServerFn` handlers (`src/lib/*.functions.ts`); no standalone
  Express/Node process, since the deploy target is serverless.
- LLM calls go to Groq via `src/lib/groq.server.ts` with round-robin key rotation over
  `GROQ_KEY_1..8`; task→model routing lives in `getModel`, and prompt plus completion budgets stay below the account TPM cap.
- Build progress is driven client-side: the browser walks the plan's file manifest in batches and
  calls `generateFile` per file, so no SSE stream is needed on serverless hosting.
- Demo auth is a signed HttpOnly cookie (`src/lib/session.server.ts`) with credentials from env —
  no user accounts.
- Stack ids are composite `frontend|backend|database` (parsed by `stackById`, legacy ids mapped), so any combination works without a stack table.
- Starter files per stack live in `src/lib/scaffolds.ts` and are written verbatim by `generateFile`, to avoid spending model calls on boilerplate.
- Thinking level is chosen per call by `pickThinking` in `groq.server.ts`, so reasoning is spent only on complex tasks.

- The build page chat sidebar keeps one conversation per project in localStorage and applies AI file changes via `followUp`, so no extra database table is needed.
