import { createServerFn } from "@tanstack/react-start";
import {
  languageFor,
  stackById,
  type Answer,
  type GeneratedFile,
  type Plan,
  type Project,
  type ProjectStatus,
  type Question,
} from "./types";

async function guard() {
  const { requireSession } = await import("./session.server");
  requireSession();
  const { getSupabase } = await import("./supabase.server");
  return getSupabase();
}

export const listProjects = createServerFn({ method: "GET" }).handler(async () => {
  const db = await guard();
  const { data, error } = await db
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as Project[];
});

export const createProject = createServerFn({ method: "POST" })
  .inputValidator((data: { description: string }) => {
    const description = data.description.trim();
    if (description.length < 50) throw new Error("Describe your app in at least 50 characters.");
    return { description: description.slice(0, 2000) };
  })
  .handler(async ({ data }) => {
    const db = await guard();
    const { data: row, error } = await db
      .from("projects")
      .insert({ description: data.description, status: "STACK" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as Project;
  });

export const getProject = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const db = await guard();
    const [projectRes, planRes, clarifyRes, filesRes] = await Promise.all([
      db.from("projects").select("*").eq("id", data.id).maybeSingle(),
      db
        .from("project_plans")
        .select("plan_json, approved_at")
        .eq("project_id", data.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("clarifications")
        .select("questions, answers")
        .eq("project_id", data.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("generated_files")
        .select("file_path, content, language")
        .eq("project_id", data.id)
        .order("file_path"),
    ]);

    if (projectRes.error) throw new Error(projectRes.error.message);
    if (!projectRes.data) throw new Error("Project not found.");

    return {
      project: projectRes.data as Project,
      plan: (planRes.data?.plan_json ?? null) as Plan | null,
      planApproved: Boolean(planRes.data?.approved_at),
      questions: (clarifyRes.data?.questions ?? []) as Question[],
      answers: (clarifyRes.data?.answers ?? []) as Answer[],
      files: (filesRes.data ?? []) as GeneratedFile[],
    };
  });

export const updateProject = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { id: string; stack?: string; status?: ProjectStatus; name?: string }) => data,
  )
  .handler(async ({ data }) => {
    const db = await guard();
    const { id, ...patch } = data;
    const { error } = await db
      .from("projects")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { success: true as const };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const db = await guard();
    const { error } = await db.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true as const };
  });

export const generatePlan = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const db = await guard();
    const { chat, parseJson } = await import("./groq.server");
    const { PLAN_SYSTEM, planUserPrompt } = await import("./prompts.server");

    const { data: project, error } = await db
      .from("projects")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!project) throw new Error("Project not found.");

    const stack = stackById((project as Project).stack);
    if (!stack) throw new Error("Pick a tech stack first.");

    await db.from("projects").update({ status: "PLANNING" }).eq("id", data.id);

    const raw = await chat({
      task: "plan",
      system: PLAN_SYSTEM,
      user: planUserPrompt((project as Project).description, stack),
      json: true,
      temperature: 0.4,
      hint: (project as Project).description,
    });
    const plan = parseJson<Plan>(raw);
    plan.pages ??= [];
    plan.apiRoutes ??= [];
    plan.dbTables ??= [];
    plan.envVars ??= [];
    plan.features ??= [];
    plan.filesToGenerate ??= [];
    const { mergeScaffold } = await import("./scaffolds");
    plan.filesToGenerate = mergeScaffold(plan.filesToGenerate, stack);

    await db.from("project_plans").delete().eq("project_id", data.id);
    const { error: insertError } = await db
      .from("project_plans")
      .insert({ project_id: data.id, plan_json: plan });
    if (insertError) throw new Error(insertError.message);

    await db
      .from("projects")
      .update({ name: plan.appName, updated_at: new Date().toISOString() })
      .eq("id", data.id);

    return plan;
  });

export const savePlan = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; plan: Plan; approve: boolean }) => data)
  .handler(async ({ data }) => {
    const db = await guard();
    await db.from("project_plans").delete().eq("project_id", data.id);
    const { error } = await db.from("project_plans").insert({
      project_id: data.id,
      plan_json: data.plan,
      approved_at: data.approve ? new Date().toISOString() : null,
    });
    if (error) throw new Error(error.message);
    await db
      .from("projects")
      .update({
        name: data.plan.appName,
        status: data.approve ? "CLARIFYING" : "PLANNING",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    return { success: true as const };
  });

export const generateQuestions = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const db = await guard();
    const { chat, parseJson } = await import("./groq.server");
    const { CLARIFY_SYSTEM, clarifyUserPrompt } = await import("./prompts.server");

    const existing = await db
      .from("clarifications")
      .select("questions")
      .eq("project_id", data.id)
      .maybeSingle();
    const cached = (existing.data?.questions ?? []) as Question[];
    if (cached.length > 0) return cached;

    const [{ data: project }, { data: planRow }] = await Promise.all([
      db.from("projects").select("description").eq("id", data.id).maybeSingle(),
      db.from("project_plans").select("plan_json").eq("project_id", data.id).maybeSingle(),
    ]);
    if (!project || !planRow) throw new Error("Approve a plan first.");

    const raw = await chat({
      task: "clarify",
      system: CLARIFY_SYSTEM,
      user: clarifyUserPrompt(
        (project as { description: string }).description,
        planRow.plan_json as Plan,
      ),
      json: true,
      temperature: 0.4,
      maxTokens: 2000,
    });
    const parsed = parseJson<{ questions: Question[] }>(raw);
    const questions = (parsed.questions ?? []).slice(0, 8);

    await db.from("clarifications").delete().eq("project_id", data.id);
    const { error } = await db
      .from("clarifications")
      .insert({ project_id: data.id, questions, answers: [] });
    if (error) throw new Error(error.message);
    return questions;
  });

export const saveAnswers = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; answers: Answer[] }) => data)
  .handler(async ({ data }) => {
    const db = await guard();
    const { error } = await db
      .from("clarifications")
      .update({ answers: data.answers, resolved_at: new Date().toISOString() })
      .eq("project_id", data.id);
    if (error) throw new Error(error.message);
    await db
      .from("projects")
      .update({ status: "BUILDING", updated_at: new Date().toISOString() })
      .eq("id", data.id);
    return { success: true as const };
  });

export const generateFile = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      id: string;
      path: string;
      description: string;
      task: "frontend_file" | "backend_file" | "schema_file" | "config_file";
    }) => data,
  )
  .handler(async ({ data }) => {
    const db = await guard();
    const { chat, stripFences } = await import("./groq.server");
    const { fileSystemPrompt, fileUserPrompt } = await import("./prompts.server");

    const [{ data: project }, { data: planRow }, { data: clarify }] = await Promise.all([
      db.from("projects").select("stack").eq("id", data.id).maybeSingle(),
      db.from("project_plans").select("plan_json").eq("project_id", data.id).maybeSingle(),
      db.from("clarifications").select("answers").eq("project_id", data.id).maybeSingle(),
    ]);
    const stack = stackById((project as { stack: string | null } | null)?.stack);
    const plan = planRow?.plan_json as Plan | undefined;
    if (!stack || !plan) throw new Error("Missing stack or plan for this project.");

    // Preloaded starter files are written verbatim, no model call needed.
    const { scaffoldFor } = await import("./scaffolds");
    const preset = scaffoldFor(stack).find((s) => s.path === data.path);

    const content = preset ? preset.content : stripFences(
      await chat({
        task: data.task,
        system: fileSystemPrompt(stack),
        user: fileUserPrompt({
          filePath: data.path,
          fileDescription: data.description,
          plan,
          answers: (clarify?.answers ?? []) as Answer[],
          stack,
          adjacentFiles: plan.filesToGenerate.map((f) => f.path),
        }),
        temperature: 0.2,
        hint: `${data.path} ${data.description}`,
      }),
    );

    const language = languageFor(data.path);
    const { error } = await db
      .from("generated_files")
      .upsert(
        { project_id: data.id, file_path: data.path, content, language },
        { onConflict: "project_id,file_path" },
      );
    if (error) throw new Error(error.message);

    return { path: data.path, content, language };
  });

export const finishBuild = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const db = await guard();
    const { error } = await db
      .from("projects")
      .update({ status: "COMPLETE", updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true as const };
  });

export const fixFile = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { id: string; filePath: string; fileContent: string; error: string }) => data,
  )
  .handler(async ({ data }) => {
    const db = await guard();
    const { chat, stripFences } = await import("./groq.server");
    const { FIX_SYSTEM, fixUserPrompt } = await import("./prompts.server");

    const fixedContent = stripFences(
      await chat({
        task: "preview_fix",
        system: FIX_SYSTEM,
        user: fixUserPrompt(data.error, data.filePath, data.fileContent),
        temperature: 0.1,
      }),
    );

    const { error } = await db
      .from("generated_files")
      .upsert(
        {
          project_id: data.id,
          file_path: data.filePath,
          content: fixedContent,
          language: languageFor(data.filePath),
        },
        { onConflict: "project_id,file_path" },
      );
    if (error) throw new Error(error.message);
    return { fixedContent };
  });

/** Saves a manual edit to a generated file. */
export const saveFile = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; filePath: string; content: string }) => {
    if (!data.filePath.trim()) throw new Error("File path is required.");
    if (data.content.length > 500_000) throw new Error("File is too large.");
    return data;
  })
  .handler(async ({ data }) => {
    const db = await guard();
    const { error } = await db.from("generated_files").upsert(
      {
        project_id: data.id,
        file_path: data.filePath,
        content: data.content,
        language: languageFor(data.filePath),
      },
      { onConflict: "project_id,file_path" },
    );
    if (error) throw new Error(error.message);
    return { success: true as const };
  });

/** Applies a natural-language edit to one file with the AI and saves it. */
export const editFileWithAi = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { id: string; filePath: string; fileContent: string; instruction: string }) => {
      const instruction = data.instruction.trim();
      if (instruction.length < 3) throw new Error("Describe the change you want.");
      return { ...data, instruction: instruction.slice(0, 2000) };
    },
  )
  .handler(async ({ data }) => {
    const db = await guard();
    const { chat, stripFences } = await import("./groq.server");
    const { EDIT_SYSTEM, editUserPrompt } = await import("./prompts.server");
    const { data: project } = await db.from("projects").select("stack").eq("id", data.id).maybeSingle();
    const stack = stackById((project as { stack: string | null } | null)?.stack);
    if (!stack) throw new Error("Missing stack for this project.");

    const content = stripFences(
      await chat({
        task: "edit",
        system: EDIT_SYSTEM,
        user: editUserPrompt(data.instruction, data.filePath, data.fileContent, stack),
        temperature: 0.2,
        hint: data.instruction,
      }),
    );
    const { error } = await db.from("generated_files").upsert(
      { project_id: data.id, file_path: data.filePath, content, language: languageFor(data.filePath) },
      { onConflict: "project_id,file_path" },
    );
    if (error) throw new Error(error.message);
    return { content };
  });

type ChatTurn = { role: "user" | "assistant"; content: string };
type ChatAttachment = { kind: "image" | "text"; name: string; data: string };

/** Follow-up chat: answers questions and applies file changes to the generated project. */
export const followUp = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { id: string; message: string; history: ChatTurn[]; attachments: ChatAttachment[] }) => {
      const message = data.message.trim();
      if (!message && data.attachments.length === 0) throw new Error("Type a message first.");
      const attachments = data.attachments.slice(0, 4).map((a) => {
        if (a.kind === "image" && !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(a.data))
          throw new Error(`${a.name} is not a supported image.`);
        if (a.kind === "image" && a.data.length > 3_800_000) throw new Error(`${a.name} is too large (max ~2.5 MB).`);
        return a.kind === "text" ? { ...a, data: a.data.slice(0, 6000) } : a;
      });
      const history = data.history
        .filter((t) => t.role === "user" || t.role === "assistant")
        .slice(-6)
        .map((t) => ({ role: t.role, content: t.content.slice(0, 1200) }));
      return { id: data.id, message: message.slice(0, 3000), history, attachments };
    },
  )
  .handler(async ({ data }) => {
    const db = await guard();
    const { chat, parseJson } = await import("./groq.server");
    const [{ data: project }, { data: rows, error }] = await Promise.all([
      db.from("projects").select("stack, name").eq("id", data.id).maybeSingle(),
      db.from("generated_files").select("file_path, content").eq("project_id", data.id),
    ]);
    if (error) throw new Error(error.message);
    const stack = stackById((project as { stack: string | null } | null)?.stack);
    const files = (rows ?? []) as { file_path: string; content: string }[];

    // 1. Images → text description with the vision model (the code model is text-only).
    const images = data.attachments.filter((a) => a.kind === "image");
    let imageNotes = "";
    if (images.length) {
      imageNotes = await chat({
        task: "vision",
        system:
          "You describe UI screenshots, mockups and images for a software engineer. Be precise: layout, components, colours, text, spacing, visible errors. Plain text, no preamble.",
        user: `User request: ${data.message || "(none)"}\nDescribe the attached image(s) as they relate to the request.`,
        images: images.map((i) => i.data),
        temperature: 0.2,
      });
    }

    // 2. Pick relevant files to include in full, within the token budget.
    const text = (data.message + " " + data.history.map((h) => h.content).join(" ")).toLowerCase();
    const scored = files
      .map((f) => {
        const base = f.file_path.split("/").pop()!.toLowerCase();
        const stem = base.replace(/\.[^.]+$/, "");
        let score = 0;
        if (text.includes(f.file_path.toLowerCase())) score += 10;
        if (text.includes(base)) score += 6;
        if (stem.length > 3 && text.includes(stem)) score += 3;
        return { f, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    let budget = 9000;
    const included: string[] = [];
    for (const { f } of scored) {
      if (f.content.length > budget) continue;
      budget -= f.content.length;
      included.push(`--- ${f.file_path} ---\n${f.content}`);
      if (included.length >= 3) break;
    }
    const textFiles = data.attachments
      .filter((a) => a.kind === "text")
      .map((a) => `--- attached: ${a.name} ---\n${a.data}`)
      .join("\n\n");

    const system = `You are Forge's senior engineer (Claude/Lovable/Codex level), chatting with the user about their generated project and making precise follow-up changes.
Stack: ${stack?.name ?? "unknown"}.
Reply with a JSON object: {"reply": string (markdown, concise, explains what you did or answers the question), "changes": [{"path": string, "content": string (FULL new file content)}]}.
Rules: only change files when the user asks for a change; every changed file must be complete and compile; keep unrelated code intact; imports must match real files in the project; new files use paths consistent with the existing layout; if a file you need is not shown, say which file and ask the user to mention it. Never use placeholders.`;
    const user = `Project files:\n${files.map((f) => f.file_path).join("\n") || "(none yet)"}\n\n${
      included.length ? `Relevant file contents:\n${included.join("\n\n")}\n\n` : ""
    }${textFiles ? `${textFiles}\n\n` : ""}${imageNotes ? `Attached image description:\n${imageNotes}\n\n` : ""}User: ${data.message || "(see attachments)"}`;

    const raw = await chat({
      task: "followup",
      system,
      user,
      history: data.history,
      json: true,
      temperature: 0.2,
      hint: data.message,
    });
    const parsed = parseJson<{ reply?: string; changes?: { path?: string; content?: string }[] }>(raw);
    const changes = (parsed.changes ?? [])
      .filter((c): c is { path: string; content: string } => !!c.path && typeof c.content === "string")
      .map((c) => ({ path: c.path.replace(/^\/+/, ""), content: c.content }));
    if (changes.length) {
      const { error: upErr } = await db.from("generated_files").upsert(
        changes.map((c) => ({
          project_id: data.id,
          file_path: c.path,
          content: c.content,
          language: languageFor(c.path),
        })),
        { onConflict: "project_id,file_path" },
      );
      if (upErr) throw new Error(upErr.message);
    }
    return { reply: parsed.reply?.trim() || "Done.", changes };
  });
