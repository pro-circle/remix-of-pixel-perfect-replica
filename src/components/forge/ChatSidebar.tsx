import { FileText, Image as ImageIcon, Loader2, Paperclip, Send, Trash2, X } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { followUp } from "@/lib/projects.functions";

type Attachment = { kind: "image" | "text"; name: string; data: string };
type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: { kind: "image" | "text"; name: string; preview?: string | undefined }[];
  changed?: string[];
  error?: boolean;
};

const TEXT_EXT = /\.(txt|md|json|ts|tsx|js|jsx|css|html|py|sql|csv|yml|yaml|env|toml)$/i;

function readFile(file: File, asDataUrl: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    if (asDataUrl) r.readAsDataURL(file);
    else r.readAsText(file);
  });
}

const MessageItem = memo(function MessageItem({ m }: { m: Msg }) {
  return (
    <div className={m.role === "user" ? "flex justify-end" : ""}>
      <div
        className={
          m.role === "user"
            ? "max-w-[90%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
            : m.error
              ? "rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              : "text-sm text-foreground"
        }
      >
        {m.attachments?.length ? (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {m.attachments.map((a, i) =>
              a.preview ? (
                <img key={i} src={a.preview} alt={a.name} className="h-14 w-14 rounded object-cover" />
              ) : (
                <span key={i} className="inline-flex items-center gap-1 rounded bg-background/20 px-1.5 py-0.5 text-xs">
                  <FileText className="size-3" />
                  {a.name}
                </span>
              ),
            )}
          </div>
        ) : null}
        <div className="prose prose-sm max-w-none break-words dark:prose-invert [&_pre]:overflow-x-auto">
          <ReactMarkdown>{m.content}</ReactMarkdown>
        </div>
        {m.changed?.length ? (
          <div className="mt-2 space-y-0.5 rounded-md border border-border bg-surface-2 p-2 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">Updated {m.changed.length} file(s)</div>
            {m.changed.map((p) => (
              <div key={p} className="truncate font-mono">{p}</div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
});

export function ChatSidebar({
  projectId,
  onFilesChanged,
}: {
  projectId: string;
  onFilesChanged: (changes: { path: string; content: string }[]) => void;
}) {
  const storageKey = `forge_chat_${projectId}`;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onChangedRef = useRef(onFilesChanged);
  onChangedRef.current = onFilesChanged;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setMessages(raw ? (JSON.parse(raw) as Msg[]) : []);
    } catch {
      setMessages([]);
    }
    setLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    try {
      // Image previews are dropped to keep storage small.
      const slim = messages.map((m) => ({
        ...m,
        attachments: m.attachments?.map(({ kind, name }) => ({ kind, name })),
      }));
      localStorage.setItem(storageKey, JSON.stringify(slim.slice(-60)));
    } catch {
      /* storage full — keep in memory */
    }
  }, [messages, loaded, storageKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const next: Attachment[] = [];
    for (const file of Array.from(list)) {
      if (file.type.startsWith("image/")) {
        if (file.size > 2.5 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 2.5 MB`);
          continue;
        }
        next.push({ kind: "image", name: file.name, data: await readFile(file, true) });
      } else if (TEXT_EXT.test(file.name) || file.type.startsWith("text/")) {
        if (file.size > 200 * 1024) {
          toast.error(`${file.name} is larger than 200 KB`);
          continue;
        }
        next.push({ kind: "text", name: file.name, data: await readFile(file, false) });
      } else {
        toast.error(`${file.name}: only images and text files are supported`);
      }
    }
    setPending((p) => [...p, ...next].slice(0, 4));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function send() {
    const text = input.trim();
    if ((!text && pending.length === 0) || busy) return;
    const userMsg: Msg = {
      id: crypto.randomUUID(),
      role: "user",
      content: text || "_(attachments)_",
      attachments: pending.map((a) => ({
        kind: a.kind,
        name: a.name,
        preview: a.kind === "image" ? a.data : undefined,
      })),
    };
    const history = messages
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, content: m.content }));
    const attachments = pending;
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setPending([]);
    setBusy(true);
    try {
      const res = await followUp({ data: { id: projectId, message: text, history, attachments } });
      if (res.changes.length) onChangedRef.current(res.changes);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: res.reply,
          changed: res.changes.map((c) => c.path),
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: (e as Error).message, error: true },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-medium">Chat & follow-ups</h2>
          <p className="text-xs text-muted-foreground">Ask questions or request changes</p>
        </div>
        {messages.length > 0 ? (
          <button
            type="button"
            aria-label="Clear conversation"
            disabled={busy}
            onClick={() => setMessages([])}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 disabled:opacity-50"
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Try “Add a dark mode toggle to the navbar” or attach a screenshot of what you want.
          </p>
        ) : (
          messages.map((m) => <MessageItem key={m.id} m={m} />)
        )}
        {busy ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Thinking…
          </div>
        ) : null}
      </div>

      <div className="border-t border-border p-3">
        {pending.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pending.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs">
                {a.kind === "image" ? <ImageIcon className="size-3" /> : <FileText className="size-3" />}
                <span className="max-w-[8rem] truncate">{a.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.json,.ts,.tsx,.js,.jsx,.css,.html,.py,.sql,.csv,.yml,.yaml,.toml"
            className="hidden"
            onChange={(e) => void addFiles(e.target.files)}
          />
          <button
            type="button"
            aria-label="Attach files"
            onClick={() => fileRef.current?.click()}
            className="rounded-md p-2 text-muted-foreground hover:bg-surface-2"
          >
            <Paperclip className="size-4" />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            rows={2}
            placeholder="Ask Forge to change something…"
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                void addFiles(e.clipboardData.files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            className="min-h-[2.5rem] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            aria-label="Send"
            disabled={busy || (!input.trim() && pending.length === 0)}
            onClick={() => void send()}
            className="rounded-md bg-primary p-2 text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
