import { Check, ChevronDown, FileCode, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./ui";

export type NodeStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "ERROR";

export type TimelineNode = {
  path: string;
  description: string;
  group: string;
  status: NodeStatus;
  content?: string | undefined;
  error?: string | undefined;
};

function StatusDot({ status }: { status: NodeStatus }) {
  if (status === "DONE") return <Check className="size-4 shrink-0 text-success" />;
  if (status === "ERROR") return <X className="size-4 shrink-0 text-destructive" />;
  if (status === "IN_PROGRESS")
    return <span className="size-2 shrink-0 animate-pulse rounded-full bg-primary" />;
  return <span className="size-2 shrink-0 rounded-full bg-border" />;
}

export function Timeline({ nodes }: { nodes: TimelineNode[] }) {
  const groups = Array.from(new Set(nodes.map((n) => n.group)));
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group}>
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {group}
          </p>
          <div className="space-y-1 border-l border-border pl-4">
            {nodes
              .filter((n) => n.group === group)
              .map((node) => (
                <TimelineRow key={node.path} node={node} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineRow({ node }: { node: TimelineNode }) {
  const [open, setOpen] = useState(false);
  const expandable = node.status === "DONE" && Boolean(node.content);

  return (
    <div className="fade-in-up">
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        title={node.description}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
          expandable && "hover:bg-surface-2",
        )}
      >
        <StatusDot status={node.status} />
        <FileCode className="size-3.5 shrink-0 text-muted-foreground" />
        <span
          className={cn(
            "flex-1 truncate font-mono text-xs",
            node.status === "IN_PROGRESS" ? "animate-pulse text-foreground" : "text-muted-foreground",
          )}
        >
          {node.path}
        </span>
        {node.status === "IN_PROGRESS" ? <Badge tone="primary">Generating…</Badge> : null}
        {node.status === "ERROR" ? <Badge tone="danger">Failed</Badge> : null}
        {expandable ? (
          <ChevronDown
            className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        ) : null}
      </button>
      {open && node.content ? (
        <pre className="mt-1 max-h-64 overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {node.content}
        </pre>
      ) : null}
      {node.status === "ERROR" && node.error ? (
        <p className="px-2 pb-1 text-[11px] text-destructive">{node.error}</p>
      ) : null}
    </div>
  );
}
