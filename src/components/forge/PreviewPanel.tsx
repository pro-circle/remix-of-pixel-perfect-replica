import {
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
  useSandpack,
} from "@codesandbox/sandpack-react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { GeneratedFile, PlanPage } from "@/lib/types";
import { Button } from "./ui";

const PLACEHOLDER = `export default function App() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0a0a0a", color: "#6b6b6b", fontFamily: "Inter, sans-serif", fontSize: 14,
    }}>
      Building your app…
    </div>
  );
}`;

const BASE_DEPS: Record<string, string> = {
  react: "^18.2.0",
  "react-dom": "^18.2.0",
};
const SKIP_DEPS = new Set(["react", "react-dom", "vite", "typescript", "@vitejs/plugin-react"]);

function relPath(p: string): string {
  const norm = p.replace(/^\.?\//, "");
  const idx = norm.indexOf("src/");
  return idx >= 0 ? `/${norm.slice(idx)}` : `/src/${norm.split("/").pop()}`;
}

/** Pulls runtime dependencies from a generated frontend package.json, if any. */
function extractDeps(files: GeneratedFile[]): Record<string, string> {
  const deps: Record<string, string> = { ...BASE_DEPS };
  const pkgs = files.filter((f) => /(^|\/)package\.json$/.test(f.file_path));
  const pkg =
    pkgs.find((f) => /(client|frontend|web)\//.test(f.file_path)) ??
    pkgs.find((f) => !/(server|backend|api)\//.test(f.file_path));
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

/** Maps generated frontend paths into a Sandpack-friendly /src tree. */
function toSandpackFiles(files: GeneratedFile[], activePath: string | null) {
  const out: Record<string, string> = {};
  for (const file of files) {
    const p = file.file_path;
    if (!/\.(tsx|ts|jsx|js|css)$/.test(p)) continue;
    if (/(^|\/)(server|backend|api)\//.test(p)) continue;
    if (/(vite|tailwind|postcss|eslint)\.config\./.test(p)) continue;
    out[relPath(p)] = file.content;
  }

  const appKey = Object.keys(out).find((k) => /^\/src\/App\.(tsx|jsx)$/.test(k));
  if (!appKey) out["/src/App.tsx"] = PLACEHOLDER;
  const appImport = "./src/App";

  // Global styles
  const cssCandidates = ["/src/index.css", "/src/styles.css", "/src/globals.css", "/src/App.css", "/src/styles/globals.css"];
  const cssImports = cssCandidates.filter((c) => out[c]).map((c) => `import ".${c}";`);

  let rootImport = appImport;
  if (activePath) {
    const rel = relPath(activePath);
    if (out[rel]) rootImport = `.${rel.replace(/\.(tsx|jsx|ts|js)$/, "")}`;
  }

  // Template entry is /index.tsx; override it (and the default Hello-world /App.tsx).
  out["/index.tsx"] =
    `import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\n${cssImports.join("\n")}\nimport * as Mod from "${rootImport}";\n\nconst Root: any = (Mod as any).default ?? Object.values(Mod).find((v) => typeof v === "function") ?? (() => null);\n\ncreateRoot(document.getElementById("root")!).render(\n  <StrictMode>\n    <Root />\n  </StrictMode>,\n);\n`;
  out["/App.tsx"] = `export { default } from "${appImport}";\n`;
  out["/styles.css"] = "";
  out["/public/index.html"] =
    `<!doctype html><html><head><meta charset="utf-8" /><script src="https://cdn.tailwindcss.com"></script></head><body><div id="root"></div></body></html>`;
  return out;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/page$/, "").replace(/[^a-z0-9]/g, "");
}

/** Find the generated file for a planned page by name, route, or filename style. */
function matchPageFile(page: PlanPage, candidates: GeneratedFile[]): GeneratedFile | undefined {
  const keys = new Set<string>();
  keys.add(normalizeName(page.name));
  const routeKey = normalizeName(page.route.replace(/[:$][^/]*/g, "").replace(/\//g, ""));
  keys.add(routeKey || "home");
  if (!routeKey) {
    keys.add("index");
    keys.add("home");
  }
  keys.delete("");
  const base = (p: string) => normalizeName((p.split("/").pop() ?? "").replace(/\.(tsx|jsx)$/, ""));
  const dirBase = (p: string) => {
    const parts = p.split("/");
    const file = parts.pop() ?? "";
    return /^index\.(tsx|jsx)$/.test(file) ? normalizeName(parts.pop() ?? "") : null;
  };
  return (
    candidates.find((f) => keys.has(base(f.file_path))) ??
    candidates.find((f) => {
      const d = dirBase(f.file_path);
      return d !== null && keys.has(d);
    })
  );
}

export function PreviewPanel({
  files,
  pages,
  onAutoFix,
  fixing,
}: {
  files: GeneratedFile[];
  pages: PlanPage[];
  onAutoFix?: ((error: string) => void) | undefined;
  fixing?: boolean | undefined;
}) {
  const [selected, setSelected] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const pageFiles = useMemo(() => {
    const candidates = files.filter(
      (f) =>
        /\.(tsx|jsx)$/.test(f.file_path) &&
        !/(^|\/)(server|backend|api)\//.test(f.file_path) &&
        /(^|\/)(pages|routes|views|screens)\//i.test(f.file_path),
    );
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
  }, [pages, files]);

  // Default to first page; explicit null means the App tab.
  const activePage =
    selected === undefined || (selected !== null && !pageFiles.some((p) => p.path === selected))
      ? (pageFiles[0]?.path ?? null)
      : selected;
  const setActivePage = setSelected;

  const sandpackFiles = useMemo(() => toSandpackFiles(files, activePage), [files, activePage]);
  const deps = useMemo(() => extractDeps(files), [files]);
  const contentKey = useMemo(() => {
    let h = 0;
    const s = Object.entries(sandpackFiles).map(([k, v]) => k + "\u0000" + v).join("|") + JSON.stringify(deps);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return `${nonce}-${activePage ?? "app"}-${h}`;
  }, [sandpackFiles, deps, nonce, activePage]);


  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setActivePage(null)}
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
              onClick={() => setActivePage(p.path)}
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
        <Button variant="secondary" size="sm" onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw className="size-3.5" />
          Refresh preview
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
        <SandpackProvider
          key={contentKey}
          template="react-ts"
          theme="dark"
          files={sandpackFiles}
          customSetup={{ dependencies: deps, entry: "/index.tsx" }}
          options={{ recompileDelay: 600, autorun: true }}
        >
          <ErrorWatcher onError={setError} />
          <SandpackLayout style={{ height: "100%", border: "none" }}>
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
