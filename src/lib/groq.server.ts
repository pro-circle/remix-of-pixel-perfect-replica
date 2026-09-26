/**
 * Groq access with round-robin key rotation and task-based model routing.
 * Server-only.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

let keyIndex = 0;

function loadKeys(): string[] {
  return [
    process.env["GROQ_KEY_1"],
    process.env["GROQ_KEY_2"],
    process.env["GROQ_KEY_3"],
    process.env["GROQ_KEY_4"],
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
  | "chat";

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
};

/** Calls Groq, rotating keys on rate-limit / auth failures. */
export async function chat({
  task,
  system,
  user,
  json = false,
  temperature = 0.3,
  maxTokens = 8000,
}: ChatOptions): Promise<string> {
  const keys = loadKeys();
  if (keys.length === 0) {
    throw new GroqError(
      "No Groq API keys configured. Add GROQ_KEY_1..GROQ_KEY_4 to your .env file.",
      500,
    );
  }

  let lastError: GroqError | null = null;

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
          model: getModel(task),
          temperature,
          max_completion_tokens: maxTokens,
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
        const body = await res.text();
        throw new GroqError(`Groq request failed (${res.status}): ${body.slice(0, 300)}`, 502);
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content ?? "";
      if (!content.trim()) throw new GroqError("Groq returned an empty response.", 502);
      return content;
    } catch (error) {
      if (error instanceof GroqError && error.status !== 502) {
        lastError = error;
        continue;
      }
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
