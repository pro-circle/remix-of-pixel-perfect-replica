import { Plus, X } from "lucide-react";
import type { Plan } from "@/lib/types";
import { Badge, Button, Card, Input, Textarea } from "./ui";

type Props = { plan: Plan; onChange: (plan: Plan) => void };

function Section({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function PlanEditor({ plan, onChange }: Props) {
  const set = <K extends keyof Plan>(key: K, value: Plan[K]) => onChange({ ...plan, [key]: value });

  return (
    <div className="space-y-4">
      <Section title="App overview">
        <div className="grid gap-3">
          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">App name</span>
            <Input value={plan.appName} onChange={(e) => set("appName", e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">One-line description</span>
            <Input value={plan.description} onChange={(e) => set("description", e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Target users</span>
            <Input value={plan.targetUsers} onChange={(e) => set("targetUsers", e.target.value)} />
          </label>
        </div>
      </Section>

      <Section
        title="Pages"
        subtitle={`${plan.pages.length} screens`}
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              set("pages", [
                ...plan.pages,
                { name: "New Page", route: "/new-page", description: "", components: [] },
              ])
            }
          >
            <Plus className="size-3.5" />
            Add page
          </Button>
        }
      >
        <div className="space-y-3">
          {plan.pages.map((page, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface-2/40 p-4">
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  value={page.name}
                  onChange={(e) => {
                    const pages = [...plan.pages];
                    pages[i] = { ...page, name: e.target.value };
                    set("pages", pages);
                  }}
                />
                <Input
                  className="flex-1 font-mono"
                  value={page.route}
                  onChange={(e) => {
                    const pages = [...plan.pages];
                    pages[i] = { ...page, route: e.target.value };
                    set("pages", pages);
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => set("pages", plan.pages.filter((_, idx) => idx !== i))}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              <Textarea
                className="mt-2"
                rows={2}
                value={page.description}
                onChange={(e) => {
                  const pages = [...plan.pages];
                  pages[i] = { ...page, description: e.target.value };
                  set("pages", pages);
                }}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {page.components.map((c) => (
                  <Badge key={c}>{c}</Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="API routes"
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              set("apiRoutes", [
                ...plan.apiRoutes,
                { method: "GET", path: "/api/new", description: "", authRequired: true },
              ])
            }
          >
            <Plus className="size-3.5" />
            Add route
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">Method</th>
                <th className="pb-2 font-medium">Path</th>
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 font-medium">Auth</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {plan.apiRoutes.map((route, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-2 pr-2">
                    <Input
                      className="px-2 py-1 font-mono text-xs"
                      value={route.method}
                      onChange={(e) => {
                        const rows = [...plan.apiRoutes];
                        rows[i] = { ...route, method: e.target.value.toUpperCase() };
                        set("apiRoutes", rows);
                      }}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <Input
                      className="px-2 py-1 font-mono text-xs"
                      value={route.path}
                      onChange={(e) => {
                        const rows = [...plan.apiRoutes];
                        rows[i] = { ...route, path: e.target.value };
                        set("apiRoutes", rows);
                      }}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <Input
                      className="px-2 py-1 text-xs"
                      value={route.description}
                      onChange={(e) => {
                        const rows = [...plan.apiRoutes];
                        rows[i] = { ...route, description: e.target.value };
                        set("apiRoutes", rows);
                      }}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      checked={route.authRequired}
                      onChange={(e) => {
                        const rows = [...plan.apiRoutes];
                        rows[i] = { ...route, authRequired: e.target.checked };
                        set("apiRoutes", rows);
                      }}
                      className="size-4 accent-[oklch(0.51_0.21_277)]"
                    />
                  </td>
                  <td className="py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        set("apiRoutes", plan.apiRoutes.filter((_, idx) => idx !== i))
                      }
                    >
                      <X className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Database tables"
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => set("dbTables", [...plan.dbTables, { name: "new_table", columns: [] }])}
          >
            <Plus className="size-3.5" />
            Add table
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {plan.dbTables.map((table, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface-2/40 p-4">
              <div className="flex gap-2">
                <Input
                  className="flex-1 font-mono"
                  value={table.name}
                  onChange={(e) => {
                    const rows = [...plan.dbTables];
                    rows[i] = { ...table, name: e.target.value };
                    set("dbTables", rows);
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => set("dbTables", plan.dbTables.filter((_, idx) => idx !== i))}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              <div className="mt-3 space-y-1.5">
                {table.columns.map((col, ci) => (
                  <div key={ci} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-foreground">{col.name}</span>
                    <Badge tone="info">{col.type}</Badge>
                    {col.constraints?.map((c) => <Badge key={c}>{c}</Badge>)}
                    <button
                      type="button"
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        const rows = [...plan.dbTables];
                        rows[i] = {
                          ...table,
                          columns: table.columns.filter((_, idx) => idx !== ci),
                        };
                        set("dbTables", rows);
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const rows = [...plan.dbTables];
                    rows[i] = {
                      ...table,
                      columns: [...table.columns, { name: "column", type: "text", constraints: [] }],
                    };
                    set("dbTables", rows);
                  }}
                >
                  <Plus className="size-3" />
                  Add column
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Environment variables"
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              set("envVars", [...plan.envVars, { key: "NEW_VAR", description: "", example: "" }])
            }
          >
            <Plus className="size-3.5" />
            Add variable
          </Button>
        }
      >
        <div className="space-y-2">
          {plan.envVars.map((env, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <Input
                className="flex-1 font-mono"
                value={env.key}
                onChange={(e) => {
                  const rows = [...plan.envVars];
                  rows[i] = { ...env, key: e.target.value };
                  set("envVars", rows);
                }}
              />
              <Input
                className="flex-1"
                value={env.description}
                onChange={(e) => {
                  const rows = [...plan.envVars];
                  rows[i] = { ...env, description: e.target.value };
                  set("envVars", rows);
                }}
              />
              <Input
                className="flex-1 font-mono"
                value={env.example}
                onChange={(e) => {
                  const rows = [...plan.envVars];
                  rows[i] = { ...env, example: e.target.value };
                  set("envVars", rows);
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => set("envVars", plan.envVars.filter((_, idx) => idx !== i))}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Features" subtitle="Toggle anything you don't want built.">
        <div className="flex flex-wrap gap-2">
          {plan.features.map((feature, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                const rows = [...plan.features];
                rows[i] = { ...feature, enabled: !feature.enabled };
                set("features", rows);
              }}
              className={
                feature.enabled
                  ? "rounded-md bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary"
                  : "rounded-md bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground line-through"
              }
            >
              {feature.name}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Files to generate" subtitle={`${plan.filesToGenerate.length} files planned`}>
        <div className="flex flex-wrap gap-1.5">
          {plan.filesToGenerate.map((f) => (
            <Badge key={f.path} tone="neutral">
              <span className="font-mono">{f.path}</span>
            </Badge>
          ))}
        </div>
      </Section>
    </div>
  );
}
