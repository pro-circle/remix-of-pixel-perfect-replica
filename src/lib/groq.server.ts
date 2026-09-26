/**
 * Groq access with round-robin key rotation and task-based model routing.
 * Server-only.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_TPM_BUDGET = 7_600;
const MIN_COMPLETION_TOKENS = 700;

let keyIndex = 0;

function loadKeys(): string[] {
  return [
    process.env["GROQ_KEY_1"],
    process.env["GROQ_KEY_2"],
    process.env["GROQ_KEY_3"],
    process.env["GROQ_KEY_4"],
    process.env["GROQ_KEY_5"],
  ].filter((k): k is string => typeof k === "string" && k.trim().length > 0);
}

export type LlmTask =
  | "plan"
  | "clarify"
  | "frontend_file"
  | "backend_file"
  | "schema_file"
  | "config_file"
  | "preview_fix"
  | "chat"
  | "edit";

export type Thinking = "none" | "low" | "medium" | "high";

/**
 * Decides how hard the model should "think". Reasoning is only spent where it
 * pays off: planning, complex logic files and debugging. Simple files skip it.
 */
export function pickThinking(task: LlmTask, hint = ""): Thinking {
  const h = hint.toLowerCase();
  const complex = /auth|payment|stripe|webhook|realtime|socket|permission|role|schema|migration|middleware|dashboard|checkout|upload|search|state|store|context/.test(h);
  switch (task) {
    case "plan":
      return hint.length > 900 ? "high" : "medium";
    case "clarify":
      return "low";
    case "backend_file":
    case "schema_file":
      return complex ? "high" : "medium";
    case "frontend_file":
      return complex ? "medium" : "low";
    case "preview_fix":
    case "edit":
      return "medium";
    case "config_file":
      return "none";
    default:
      return "low";
  }
}

function reasoningParams(model: string, thinking: Thinking): Record<string, unknown> {
  if (model.startsWith("openai/gpt-oss")) {
    // gpt-oss always reasons; "low" is the cheapest setting. Keep the trace out of the output.
    return { reasoning_effort: thinking === "none" ? "low" : thinking, include_reasoning: false };
  }
  if (model.startsWith("qwen/")) {
    return thinking === "none"
      ? { reasoning_effort: "none" }
      : { reasoning_effort: "default", reasoning_format: "hidden" };
  }
  return {};
}

const TASK_OUTPUT_BUDGET: Record<LlmTask, number> = {
  plan: 3_600,
  clarify: 1_600,
  frontend_file: 4_800,
  backend_file: 4_800,
  schema_file: 3_600,
  config_file: 1_800,
  preview_fix: 4_000,
  chat: 2_400,
  edit: 4_800,
};

/** Conservative estimate used to keep prompt + requested completion under Groq's TPM cap. */
function estimateInputTokens(system: string, user: string): number {
  return Math.ceil((system.length + user.length) / 3.5) + 160;
}

function completionBudget(task: LlmTask, system: string, user: string, requested?: number): number {
  const desired = requested ?? TASK_OUTPUT_BUDGET[task];
  const available = GROQ_TPM_BUDGET - estimateInputTokens(system, user);
  if (available < MIN_COMPLETION_TOKENS) {
    throw new GroqError(
      "This request contains too much context for the current Groq limit. Shorten the file or instruction and try again.",
      413,
    );
  }
  return Math.max(MIN_COMPLETION_TOKENS, Math.min(desired, available));
}

async function groqError(res: Response): Promise<GroqError> {
  const fallback = `Groq request failed (${res.status}).`;
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    const providerMessage = body.error?.message ?? "";
    if (res.status === 413 || /request too large|tokens per minute/i.test(providerMessage)) {
      return new GroqError(
        "This generation is too large for the current Groq token limit. Forge reduced future request budgets; retry this file.",
        413,
      );
    }
    return new GroqError(providerMessage ? `Groq request failed: ${providerMessage}` : fallback, res.status);
  } catch {
    return new GroqError(fallback, res.status);
  }
}

export function getModel(task: LlmTask): string {
  switch (task) {
    case "plan":
    case "clarify":
      return "openai/gpt-oss-120b";
    case "frontend_file":
    case "backend_file":
    case "schema_file":
      return "openai/gpt-oss-120b";
    case "config_file":
      return "openai/gpt-oss-20b";
    case "preview_fix":
      return "qwen/qwen3-32b";
    case "edit":
      return "openai/gpt-oss-120b";
    default:
      return "openai/gpt-oss-20b";
  }
}

export class GroqError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type ChatOptions = {
  task: LlmTask;
  system: string;
  user: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Override the automatic thinking level; `hint` feeds the automatic choice. */
  thinking?: Thinking;
  hint?: string;
};

/** Calls Groq, rotating keys on rate-limit / auth failures. */
export async function chat({
  task,
  system,
  user,
  json = false,
  temperature = 0.3,
  maxTokens,
  thinking,
  hint = "",
}: ChatOptions): Promise<string> {
  const keys = loadKeys();
  if (keys.length === 0) {
    throw new GroqError(
      "No Groq API keys configured. Add GROQ_KEY_1..GROQ_KEY_5 to your .env file.",
      500,
    );
  }

  let lastError: GroqError | null = null;
  const model = getModel(task);
  const level = thinking ?? pickThinking(task, hint || user.slice(0, 1500));
  // Reasoning is part of the completion budget, never an allowance added on top.
  const outputTokens = completionBudget(task, system, user, maxTokens);

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = keys[keyIndex % keys.length]!;
    const usedIndex = (keyIndex % keys.length) + 1;
    keyIndex++;

    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          ...reasoningParams(model, level),
          temperature,
          max_completion_tokens: outputTokens,
          ...(json ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });

      if (res.status === 429 || res.status === 401 || res.status === 403) {
        console.warn(`Groq key #${usedIndex} rejected (status ${res.status}), rotating.`);
        lastError = new GroqError(
          res.status === 429
            ? "All Groq keys are rate limited. Try again in a moment."
            : "A Groq key was rejected. Check your keys in .env.",
          res.status,
        );
        continue;
      }

      if (!res.ok) {
        throw await groqError(res);
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content ?? "";
      if (!content.trim()) throw new GroqError("Groq returned an empty response.", 502);
      return content;
    } catch (error) {
      if (error instanceof GroqError && (error.status === 401 || error.status === 403 || error.status === 429)) {
        lastError = error;
        continue;
      }
      if (error instanceof GroqError) throw error;
      if (attempt === keys.length - 1) throw error;
      lastError = error instanceof GroqError ? error : new GroqError(String(error), 502);
    }
  }

  throw lastError ?? new GroqError("Groq request failed.", 502);
}

/** Strips markdown fences and parses JSON, tolerating stray prose. */
export function parseJson<T>(raw: string): T {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) text = fence[1].trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as T;
    }
    throw new GroqError("The model did not return valid JSON. Try again.", 502);
  }
}

/** Strips markdown fences from generated file content. */
export function stripFences(raw: string): string {
  const text = raw.trim();
  const fence = text.match(/^```[a-zA-Z0-9]*\s*\n([\s\S]*?)\n?```$/);
  return (fence?.[1] ?? text).trim() + "\n";
}
