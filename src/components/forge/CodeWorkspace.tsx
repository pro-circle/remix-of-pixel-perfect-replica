import { File, Save, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { editFileWithAi, saveFile } from "@/lib/projects.functions";
import type { GeneratedFile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, Input } from "./ui";

type Hit = { path: string; line?: number; snippet?: string };

/** File search (names + contents), manual editing and AI edits for generated files. */
export function CodeWorkspace({
  projectId,
  files,
  onChange,
}: {
  projectId: string;
  files: GeneratedFile[];
  onChange: (path: string, content: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activePath, setActivePath] = useState<string | null>(files[0]?.file_path ?? null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [editing, setEditing] = useState(false);

  const active = files.find((f) => f.file_path === activePath) ?? null;
  const dirty = active !== null && draft !== active.content;

  useEffect(() => {
    setDraft(active?.content ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, active?.content]);

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...files].sort((a, b) => a.file_path.localeCompare(b.file_path));
    if (!q) return sorted.map((f) => ({ path: f.file_path }));
    const out: Hit[] = [];
    for (const f of sorted) {
      if (f.file_path.toLowerCase().includes(q)) out.push({ path: f.file_path });
      const lines = f.content.split("\n");
      let count = 0;
      for (let i = 0; i < lines.length && count < 3; i++) {
        if (lines[i]!.toLowerCase().includes(q)) {
          out.push({ path: f.file_path, line: i + 1, snippet: lines[i]!.trim().slice(0, 90) });
          count++;
        }
      }
    }
    return out.slice(0, 200);
  }, [files, query]);

  function open(path: string) {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setActivePath(path);
  }

  async function save() {
    if (!active) return;
    setSaving(true);
    try {
      await saveFile({ data: { id: projectId, filePath: active.file_path, content: draft } });
      onChange(active.file_path, draft);
      toast.success(`Saved ${active.file_path}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function aiEdit() {
    if (!active || !instruction.trim()) return;
    setEditing(true);
    try {
      const { content } = await editFileWithAi({
        data: { id: projectId, filePath: active.file_path, fileContent: draft, instruction },
      });
      onChange(active.file_path, content);
      setDraft(content);
      setInstruction("");
      toast.success("Change applied");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEditing(false);
    }
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[260px_1fr] overflow-hidden rounded-xl border border-border">
      <div className="flex min-h-0 flex-col border-r border-border">
        <div className="relative border-b border-border p-2">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files and code"
            className="pl-8 text-xs"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {hits.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">No matches.</p>
          ) : (
            hits.map((h, i) => (
              <button
                key={`${h.path}-${h.line ?? 0}-${i}`}
                type="button"
                onClick={() => open(h.path)}
                className={cn(
                  "block w-full px-3 py-1 text-left font-mono text-[11px] hover:bg-surface-2",
                  h.path === activePath && !h.line ? "bg-primary-soft text-primary" : "text-muted-foreground",
                )}
              >
                {h.line ? (
                  <span className="block truncate pl-4">
                    <span className="text-primary">{h.line}</span> {h.snippet}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 truncate">
                    <File className="size-3 shrink-0" />
                    <span className="truncate">{h.path}</span>
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-col">
        {active ? (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="truncate font-mono text-xs">
                {active.file_path}
                {dirty ? <span className="ml-1 text-primary">•</span> : null}
              </span>
              <Button size="sm" disabled={!dirty} loading={saving} onClick={save}>
                <Save className="size-3.5" />
                Save
              </Button>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                  e.preventDefault();
                  if (dirty) void save();
                }
              }}
              spellCheck={false}
              className="min-h-0 flex-1 resize-none bg-background p-3 font-mono text-xs leading-relaxed outline-none"
            />
            <div className="flex items-center gap-2 border-t border-border p-2">
              <Input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void aiEdit();
                }}
                placeholder="Ask AI to change this file…"
                className="text-xs"
              />
              <Button size="sm" loading={editing} disabled={!instruction.trim()} onClick={aiEdit}>
                <Sparkles className="size-3.5" />
                Apply
              </Button>
            </div>
          </>
        ) : (
          <p className="p-6 text-sm text-muted-foreground">No files yet.</p>
        )}
      </div>
    </div>
  );
}
