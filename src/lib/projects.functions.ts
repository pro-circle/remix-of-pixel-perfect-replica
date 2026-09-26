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
    });
    const plan = parseJson<Plan>(raw);
    plan.pages ??= [];
    plan.apiRoutes ??= [];
    plan.dbTables ??= [];
    plan.envVars ??= [];
    plan.features ??= [];
    plan.filesToGenerate ??= [];

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

    const content = stripFences(
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
