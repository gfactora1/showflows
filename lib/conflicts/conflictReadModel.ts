import type { ConflictSummaryModel } from "@/app/projects/[projectId]/conflicts/ui/components/ConflictSummary";
import type { ConflictGroupModel } from "@/app/projects/[projectId]/conflicts/ui/components/ConflictGroupList";
import type { ConflictCardModel } from "@/app/projects/[projectId]/conflicts/ui/components/ConflictCard";

type ComputedConflictRow = {
  id: string;
  project_id: string;
  run_id: string;
  conflict_type: string;
  severity: number; // integer
  show_id: string | null;
  other_show_id: string | null;
  person_id: string | null;
  role_id: string | null;
  title: string;
  detail: any; // jsonb
  created_at: string;
};

function severityToLabel(n: number): "Critical" | "Warning" | "Info" {
  // We are not guessing beyond what’s safe:
  // - your default is 2, so treat 2 as Warning
  // - 1 is Critical
  // - 3+ becomes Info
  if (n <= 1) return "Critical";
  if (n === 2) return "Warning";
  return "Info";
}

function groupTitleFromType(type: string): string {
  const t = (type ?? "").toLowerCase();

  if (t.includes("schedule") || t.includes("overlap") || t.includes("double")) {
    return "Scheduling conflicts";
  }
  if (t.includes("missing") && t.includes("role")) {
    return "Missing required roles";
  }
  if (t.includes("sound") || (t.includes("missing") && t.includes("provider"))) {
    return "Missing sound provider";
  }
  return "Other";
}

function windowLabelFromDetail(detail: any): string | undefined {
  // Only use what actually exists; if detail doesn't carry time, don't invent it.
  const start = detail?.start ?? detail?.starts_at ?? detail?.range_start ?? null;
  const end = detail?.end ?? detail?.ends_at ?? detail?.range_end ?? null;
  if (!start && !end) return undefined;

  const s = start ? new Date(start).toLocaleString() : "?";
  const e = end ? new Date(end).toLocaleString() : "?";
  return `${s} → ${e}`;
}

function detailSummary(row: ComputedConflictRow): string | undefined {
  // Keep this minimal and truthful: IDs are better than hallucinated names.
  const parts: string[] = [];

  if (row.person_id) parts.push(`person: ${row.person_id}`);
  if (row.role_id) parts.push(`role: ${row.role_id}`);
  if (row.show_id) parts.push(`show: ${row.show_id}`);
  if (row.other_show_id) parts.push(`other show: ${row.other_show_id}`);

  // If detail includes obvious human-readable info, surface it without assumptions.
  const extra =
    row.detail?.message ??
    row.detail?.reason ??
    row.detail?.note ??
    row.detail?.missing ??
    undefined;

  if (extra && typeof extra === "string") parts.push(extra);

  return parts.length ? parts.join(" · ") : undefined;
}

export function mapRowsToViewModel(rows: any[]): {
  summary: ConflictSummaryModel;
  groups: ConflictGroupModel[];
} {
  const typedRows = (rows ?? []) as ComputedConflictRow[];

  const cards: ConflictCardModel[] = typedRows.map((row) => ({
    id: row.id,
    headline: row.title,
    severityLabel: severityToLabel(row.severity),
    windowLabel: windowLabelFromDetail(row.detail),
    detail: detailSummary(row),
    raw: row.detail, // keep detail JSON only (not whole row) as a safe “more info” hatch
  }));

  const summary: ConflictSummaryModel = {
    total: cards.length,
    critical: cards.filter((c) => c.severityLabel === "Critical").length,
    warning: cards.filter((c) => c.severityLabel === "Warning").length,
    info: cards.filter((c) => c.severityLabel === "Info").length,
  };

  // group by conflict_type -> bucket titles
  const grouped = new Map<string, ConflictCardModel[]>();
  for (let i = 0; i < typedRows.length; i++) {
    const row = typedRows[i];
    const title = groupTitleFromType(row.conflict_type);
    grouped.set(title, [...(grouped.get(title) ?? []), cards[i]]);
  }

  const groups: ConflictGroupModel[] = Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([title, items]) => ({ title, items }));

  return { summary, groups };
}