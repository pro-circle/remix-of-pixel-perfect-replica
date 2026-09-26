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

/** Maps generated frontend paths into a Sandpack-friendly /src tree. */
function toSandpackFiles(files: GeneratedFile[], activePath: string | null) {
  const out: Record<string, string> = {};
  for (const file of files) {
    const p = file.file_path;
    if (!/\.(tsx|ts|jsx|js|css)$/.test(p)) continue;
    if (/(^|\/)(server|backend|api)\//.test(p)) continue;
    const idx = p.indexOf("src/");
    const rel = idx >= 0 ? p.slice(idx) : `src/${p.split("/").pop()}`;
    out[`/${rel}`] = file.content;
  }

  const hasApp = Object.keys(out).some((k) => /\/src\/App\.(tsx|jsx)$/.test(k));
  if (!hasApp) out["/src/App.tsx"] = PLACEHOLDER;

  if (activePath) {
    const idx = activePath.indexOf("src/");
    const rel = idx >= 0 ? `/${activePath.slice(idx)}` : null;
    const source = rel ? out[rel] : null;
    if (rel && source) {
      out["/src/App.tsx"] = `import Page from "${rel.replace("/src", ".").replace(/\.(tsx|jsx)$/, "")}";\n\nexport default function App() {\n  return <Page />;\n}\n`;
    }
  }

  out["/src/index.tsx"] =
    `import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\n\ncreateRoot(document.getElementById("root")!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n);\n`;
  out["/index.html"] = `<!doctype html><html><body><div id="root"></div></body></html>`;
  return out;
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
  onAutoFix,
  fixing,
}: {
  files: GeneratedFile[];
  pages: PlanPage[];
  onAutoFix?: ((error: string) => void) | undefined;
  fixing?: boolean | undefined;
}) {
  const [activePage, setActivePage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const pageFiles = useMemo(
    () =>
      pages
        .map((page) => {
          const match = files.find((f) =>
            f.file_path.toLowerCase().includes(`/pages/${page.name.replace(/\s+/g, "")}.`.toLowerCase()),
          );
          return match ? { name: page.name, path: match.file_path } : null;
        })
        .filter((v): v is { name: string; path: string } => v !== null),
    [pages, files],
  );

  const sandpackFiles = useMemo(() => toSandpackFiles(files, activePage), [files, activePage]);

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
          key={nonce}
          template="react-ts"
          theme="dark"
          files={sandpackFiles}
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
