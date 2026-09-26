import { ChevronRight, File, Folder } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type TreeNode = { name: string; path: string; children: Map<string, TreeNode>; isFile: boolean };

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map(), isFile: false };
  for (const path of paths) {
    const parts = path.split("/").filter(Boolean);
    let node = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      const key = part;
      if (!node.children.has(key)) {
        node.children.set(key, {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          children: new Map(),
          isFile,
        });
      }
      node = node.children.get(key)!;
    });
  }
  return root;
}

function TreeBranch({
  node,
  depth,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  onSelect?: ((path: string) => void) | undefined;
}) {
  const [open, setOpen] = useState(depth < 2);
  const children = Array.from(node.children.values()).sort((a, b) =>
    a.isFile === b.isFile ? a.name.localeCompare(b.name) : a.isFile ? 1 : -1,
  );

  if (node.isFile) {
    return (
      <button
        type="button"
        onClick={() => onSelect?.(node.path)}
        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        style={{ paddingLeft: depth * 12 + 8 }}
      >
        <File className="size-3.5 shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      {node.name ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-xs text-foreground hover:bg-surface-2"
          style={{ paddingLeft: depth * 12 + 8 }}
        >
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
          <Folder className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">{node.name}</span>
        </button>
      ) : null}
      {open || !node.name
        ? children.map((child) => (
            <TreeBranch
              key={child.path}
              node={child}
              depth={node.name ? depth + 1 : depth}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  );
}

export function FileTree({
  paths,
  onSelect,
}: {
  paths: string[];
  onSelect?: ((path: string) => void) | undefined;
}) {
  const tree = buildTree(paths);
  return (
    <div className="max-h-[420px] overflow-auto rounded-lg border border-border bg-background py-2">
      <TreeBranch node={tree} depth={0} onSelect={onSelect} />
    </div>
  );
}
