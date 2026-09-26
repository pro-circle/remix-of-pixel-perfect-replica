import {
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
  useSandpack,
} from "@codesandbox/sandpack-react";
import { AlertTriangle, ArrowUpRight, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { GeneratedFile, PlanPage } from "@/lib/types";
import { Button } from "./ui";

type FrontendKind = "react" | "nextjs" | "html";

const PLACEHOLDER = `export default function App() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0a0a0a", color: "#6b6b6b", fontFamily: "system-ui, sans-serif", fontSize: 14,
    }}>
      Building your app…
    </div>
  );
}`;

const HTML_PLACEHOLDER = `<!doctype html><html><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#6b6b6b;font-family:system-ui">Building your app…</body></html>`;

const BASE_DEPS: Record<string, string> = {
  react: "^18.2.0",
  "react-dom": "^18.2.0",
};
const SKIP_DEPS = new Set(["react", "react-dom", "vite", "typescript", "@vitejs/plugin-react", "next"]);

/** Minimal stand-ins so Next.js pages render inside the browser sandbox. */
const NEXT_SHIMS: Record<string, string> = {
  "/src/__next/link.tsx": `import * as React from "react";
export default function Link({ href, children, ...rest }: any) {
  const url = typeof href === "string" ? href : href?.pathname ?? "#";
  return <a href={url} onClick={(e) => e.preventDefault()} {...rest}>{children}</a>;
}
`,
  "/src/__next/image.tsx": `import * as React from "react";
export default function Image({ src, alt, fill, priority, ...rest }: any) {
  const url = typeof src === "string" ? src : src?.src;
  return <img src={url} alt={alt} style={fill ? { width: "100%", height: "100%", objectFit: "cover" } : undefined} {...rest} />;
}
`,
  "/src/__next/navigation.ts": `export const useRouter = () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {}, prefetch: () => {} });
export const usePathname = () => "/";
export const useSearchParams = () => new URLSearchParams();
export const useParams = () => ({});
export const redirect = () => {};
export const notFound = () => {};
`,
  "/src/__next/head.tsx": `export default function Head() { return null; }\n`,
};

export function detectFrontend(files: GeneratedFile[], stackId?: string | null): FrontendKind {
  const fe = stackId?.split("|")[0];
  if (fe === "nextjs" || fe === "html" || fe === "react") return fe;
  if (files.some((f) => /(^|\/)app\/(.*\/)?page\.(tsx|jsx)$/.test(f.file_path))) return "nextjs";
  if (!files.some((f) => /\.(tsx|jsx)$/.test(f.file_path)) && files.some((f) => f.file_path.endsWith(".html")))
    return "html";
  return "react";
}

const isBackend = (p: string) => /(^|\/)(server|backend|supabase)\//.test(p);

function stripFrontendPrefix(p: string): string {
  return p.replace(/^\.?\//, "").replace(/^(frontend|client|web)\//, "");
}

/** Every frontend file goes under /src so `@/` maps to /src for both React and Next. */
function relPath(p: string): string {
  const norm = stripFrontendPrefix(p);
  return norm.startsWith("src/") ? `/${norm}` : `/src/${norm}`;
}

function relativeImport(fromFile: string, target: string): string {
  const from = fromFile.split("/").slice(0, -1).filter(Boolean);
  const to = target.split("/").filter(Boolean);
  let i = 0;
  while (i < from.length && i < to.length && from[i] === to[i]) i++;
  const up = from.length - i;
  const rest = to.slice(i).join("/");
  return (up === 0 ? "./" : "../".repeat(up)) + rest;
}

function rewriteImports(file: string, code: string, kind: FrontendKind): string {
  let out = code.replace(/(from\s+|import\s*\(\s*|import\s+)(["'])@\/([^"']+)\2/g, (_m, pre, q, rest) => {
    return `${pre}${q}${relativeImport(file, `/src/${rest}`)}${q}`;
  });
  if (kind === "nextjs") {
    out = out
      .replace(/^\s*["']use (client|server)["'];?\s*$/gm, "")
      .replace(/^import\s+[^;]*from\s+["']next\/font\/[^"']+["'];?\s*$/gm, "")
      .replace(/^const\s+\w+\s*=\s*\w+\(\{[\s\S]*?\}\);?\s*$/gm, (m) =>
        /subsets|weight/.test(m) ? "" : m,
      )
      .replace(/(["'])next\/(link|image|navigation|head)\1/g, (_m, q, mod) => {
        return `${q}${relativeImport(file, `/src/__next/${mod}`)}${q}`;
      })
      .replace(/\b\w+\.className\b/g, '""');
  }
  return out;
}

/** Pulls runtime dependencies from a generated frontend package.json, if any. */
function extractDeps(files: GeneratedFile[]): Record<string, string> {
  const deps: Record<string, string> = { ...BASE_DEPS };
  const pkgs = files.filter((f) => /(^|\/)package\.json$/.test(f.file_path));
  const pkg =
    pkgs.find((f) => /(client|frontend|web)\//.test(f.file_path)) ??
    pkgs.find((f) => !isBackend(f.file_path));
  if (!pkg) return deps;
  try {
    const json = JSON.parse(pkg.content) as { dependencies?: Record<string, string> };
    for (const [name, version] of Object.entries(json.dependencies ?? {})) {
      if (SKIP_DEPS.has(name) || typeof version !== "string") continue;
      if (/^(workspace|file|link):/.test(version)) continue;
      deps[name] = version;
    }
  } catch {
    // ignore malformed package.json
  }
  return deps;
}

function toReactFiles(files: GeneratedFile[], activePath: string | null, kind: FrontendKind) {
  const out: Record<string, string> = {};
  for (const file of files) {
    const p = file.file_path;
    if (!/\.(tsx|ts|jsx|js|css)$/.test(p)) continue;
    if (isBackend(p)) continue;
    if (/(vite|tailwind|postcss|eslint|next)\.config\./.test(p)) continue;
    if (/(^|\/)(main|index)\.(tsx|jsx)$/.test(p) && /(^|\/)src\/(main|index)\./.test(p)) continue;
    const key = relPath(p);
    out[key] = /\.css$/.test(p) ? file.content.replace(/^@tailwind.*$/gm, "") : rewriteImports(key, file.content, kind);
  }
  if (kind === "nextjs") Object.assign(out, NEXT_SHIMS);

  const defaultKey =
    kind === "nextjs"
      ? Object.keys(out).find((k) => /^\/src\/app\/page\.(tsx|jsx)$/.test(k))
      : Object.keys(out).find((k) => /^\/src\/App\.(tsx|jsx)$/.test(k));
  let rootKey = defaultKey ?? "/src/__placeholder.tsx";
  if (!defaultKey) out[rootKey] = PLACEHOLDER;
  if (activePath && out[relPath(activePath)]) rootKey = relPath(activePath);
  const rootImport = `.${rootKey.replace(/\.(tsx|jsx|ts|js)$/, "")}`;

  const cssCandidates = [
    "/src/index.css",
    "/src/styles.css",
    "/src/globals.css",
    "/src/App.css",
    "/src/styles/globals.css",
    "/src/app/globals.css",
  ];
  const cssImports = cssCandidates.filter((c) => out[c]).map((c) => `import ".${c}";`);

  out["/index.tsx"] =
    `import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\n${cssImports.join("\n")}\nimport * as Mod from "${rootImport}";\n\nconst Root: any = (Mod as any).default ?? Object.values(Mod).find((v) => typeof v === "function") ?? (() => null);\n\ncreateRoot(document.getElementById("root")!).render(\n  <StrictMode>\n    <Root params={{}} searchParams={{}} />\n  </StrictMode>,\n);\n`;
  out["/App.tsx"] = `export { default } from "${rootImport}";\n`;
  out["/styles.css"] = "";
  out["/public/index.html"] =
    `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><script src="https://cdn.tailwindcss.com"></script></head><body><div id="root"></div></body></html>`;
  return out;
}

function toStaticFiles(files: GeneratedFile[], activePath: string | null) {
  const out: Record<string, string> = {};
  for (const file of files) {
    const p = file.file_path;
    if (isBackend(p) || !/\.(html|css|js|json|svg)$/.test(p) || /package\.json$/.test(p)) continue;
    out[`/${stripFrontendPrefix(p)}`] = file.content;
  }
  const active = activePath ? out[`/${stripFrontendPrefix(activePath)}`] : undefined;
  if (active) out["/index.html"] = active;
  if (!out["/index.html"]) {
    const firstHtml = Object.keys(out).find((k) => k.endsWith(".html"));
    out["/index.html"] = firstHtml ? out[firstHtml]! : HTML_PLACEHOLDER;
  }
  return out;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/page$/, "").replace(/[^a-z0-9]/g, "");
}

/** Find the generated file for a planned page by name, route, or filename style. */
function matchPageFile(page: PlanPage, candidates: GeneratedFile[]): GeneratedFile | undefined {
  const keys = new Set<string>();
  keys.add(normalizeName(page.name));
  const routeKey = normalizeName(page.route.replace(/[:$[][^/]*/g, "").replace(/\//g, ""));
  keys.add(routeKey || "home");
  if (!routeKey) {
    keys.add("index");
    keys.add("home");
  }
  keys.delete("");
  const ext = /\.(tsx|jsx|html)$/;
  const base = (p: string) => normalizeName((p.split("/").pop() ?? "").replace(ext, ""));
  const dirBase = (p: string) => {
    const parts = p.split("/");
    const file = parts.pop() ?? "";
    if (!/^(index|page)\.(tsx|jsx)$/.test(file)) return null;
    const dir = parts.pop() ?? "";
    // Next.js root page lives directly in app/
    if (dir === "app" && file.startsWith("page")) return "home";
    return normalizeName(dir.replace(/^\(|\)$/g, ""));
  };
  return (
    candidates.find((f) => keys.has(base(f.file_path)) && !/^(page|index)\./.test(f.file_path.split("/").pop() ?? "")) ??
    candidates.find((f) => {
      const d = dirBase(f.file_path);
      return d !== null && keys.has(d);
    }) ??
    candidates.find((f) => keys.has(base(f.file_path)))
  );
}

function ErrorWatcher({ onError }: { onError: (message: string | null) => void }) {
  const { sandpack, listen } = useSandpack();

  useEffect(() => {
    const unsubscribe = listen((msg) => {
      if (msg.type === "action" && msg.action === "show-error") {
        onError(msg.message || msg.title || "Unknown preview error");
      }
      if (msg.type === "start" || msg.type === "success") onError(null);
    });
    return unsubscribe;
  }, [listen, onError]);

  useEffect(() => {
    if (sandpack.error?.message) onError(sandpack.error.message);
  }, [sandpack.error, onError]);

  return null;
}

export function PreviewPanel({
  files,
  pages,
  stackId,
  projectId,
  initialPage,
  fullscreen,
  onAutoFix,
  fixing,
}: {
  files: GeneratedFile[];
  pages: PlanPage[];
  stackId?: string | null | undefined;
  /** When set, shows the "open in new tab" arrow. */
  projectId?: string | undefined;
  initialPage?: string | undefined;
  fullscreen?: boolean | undefined;
  onAutoFix?: ((error: string) => void) | undefined;
  fixing?: boolean | undefined;
}) {
  const [selected, setSelected] = useState<string | null | undefined>(initialPage);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const kind = useMemo(() => detectFrontend(files, stackId), [files, stackId]);

  const pageFiles = useMemo(() => {
    const candidates = files.filter((f) => {
      const p = f.file_path;
      if (isBackend(p)) return false;
      if (kind === "html") return p.endsWith(".html");
      if (!/\.(tsx|jsx)$/.test(p)) return false;
      if (kind === "nextjs") return /(^|\/)app\/(.*\/)?page\.(tsx|jsx)$/.test(p);
      return /(^|\/)(pages|routes|views|screens)\//i.test(p);
    });
    const seen = new Set<string>();
    const out: { name: string; path: string }[] = [];
    for (const page of pages) {
      const match = matchPageFile(page, candidates);
      if (match && !seen.has(match.file_path)) {
        seen.add(match.file_path);
        out.push({ name: page.name, path: match.file_path });
      }
    }
    return out;
  }, [pages, files, kind]);

  // Default to first page; explicit null means the App tab.
  const activePage =
    selected === undefined || (selected !== null && !pageFiles.some((p) => p.path === selected))
      ? (pageFiles[0]?.path ?? null)
      : selected;

  const sandpackFiles = useMemo(
    () => (kind === "html" ? toStaticFiles(files, activePage) : toReactFiles(files, activePage, kind)),
    [files, activePage, kind],
  );
  const deps = useMemo(() => extractDeps(files), [files]);
  const contentKey = useMemo(() => {
    let h = 0;
    const s =
      Object.entries(sandpackFiles)
        .map(([k, v]) => k + "\u0000" + v)
        .join("|") + JSON.stringify(deps);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return `${nonce}-${activePage ?? "app"}-${h}`;
  }, [sandpackFiles, deps, nonce, activePage]);

  function openInNewTab() {
    if (!projectId) return;
    const q = activePage ? `?page=${encodeURIComponent(activePage)}` : "";
    window.open(`/preview/${projectId}${q}`, "_blank", "noopener");
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", fullscreen ? "gap-0" : "gap-3")}>
      <div className={cn("flex items-center justify-between gap-3", fullscreen && "border-b border-border px-3 py-2")}>
        <div className="flex min-w-0 flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs",
              activePage === null
                ? "bg-primary-soft text-primary"
                : "text-muted-foreground hover:bg-surface-2",
            )}
          >
            App
          </button>
          {pageFiles.map((p) => (
            <button
              key={p.path}
              type="button"
              onClick={() => setSelected(p.path)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs",
                activePage === p.path
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:bg-surface-2",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          {projectId ? (
            <Button variant="secondary" size="sm" onClick={openInNewTab} aria-label="Open preview in a new tab" title="Open in new tab">
              <ArrowUpRight className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className={cn("min-h-0 flex-1 overflow-hidden", !fullscreen && "rounded-xl border border-border")}>
        <SandpackProvider
          key={contentKey}
          template={kind === "html" ? "static" : "react-ts"}
          theme="dark"
          files={sandpackFiles}
          customSetup={kind === "html" ? {} : { dependencies: deps, entry: "/index.tsx" }}
          options={{ recompileDelay: 600, autorun: true }}
        >
          <ErrorWatcher onError={setError} />
          <SandpackLayout style={{ height: "100%", border: "none", borderRadius: 0 }}>
            <SandpackPreview
              showNavigator={false}
              showOpenInCodeSandbox={false}
              showRefreshButton
              style={{ height: "100%" }}
            />
          </SandpackLayout>
        </SandpackProvider>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive-soft p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-destructive">Preview error detected</p>
              <p className="mt-1 max-h-24 overflow-auto font-mono text-[11px] text-destructive/90">
                {error}
              </p>
            </div>
            {onAutoFix ? (
              <Button size="sm" loading={fixing} onClick={() => onAutoFix(error)}>
                Auto-fix with AI
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
