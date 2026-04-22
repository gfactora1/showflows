import type { ConflictSummaryModel } from "@/app/projects/[projectId]/conflicts/ui/components/ConflictSummary";
import type { ConflictGroupModel } from "@/app/projects/[projectId]/conflicts/ui/components/ConflictGroupList";
import type { ConflictCardModel } from "@/app/projects/[projectId]/conflicts/ui/components/ConflictCard";

type SeverityLabel = "Critical" | "Warning" | "Info";

function severityToLabel(n: number): SeverityLabel {
  if (n >= 3) return "Critical";
  if (n === 2) return "Warning";
  return "Info";
}

function labelRank(label: SeverityLabel): number {
  // higher = more severe
  if (label === "Critical") return 3;
  if (label === "Warning") return 2;
  return 1;
}

function groupTitleFromType(type: string): string {
  const t = (type ?? "").toLowerCase();
  if (t.includes("schedule") || t.includes("overlap") || t.includes("double")) return "Scheduling conflicts";
  if (t.includes("missing") && t.includes("role")) return "Missing required roles";
  if (t.includes("sound") || (t.includes("missing") && t.includes("provider"))) return "Missing sound provider";
  return "Other";
}

function fmtShow(show: any | undefined) {
  if (!show) return undefined;
  const when = `${new Date(show.starts_at).toLocaleString()} → ${new Date(show.ends_at).toLocaleString()}`;
  const where = [show.venue, show.city].filter(Boolean).join(" · ");
  return { when, where };
}

export function mapEnrichedToViewModel(payload: any): {
  summary: ConflictSummaryModel;
  groups: ConflictGroupModel[];
} {
  const conflicts = (payload?.conflicts ?? []) as any[];
  const lookups = payload?.lookups ?? {};
  const shows: Record<string, any> = lookups.shows ?? {};
  const people: Record<string, any> = lookups.people ?? {};
  const roles: Record<string, any> = lookups.roles ?? {};
  const providers: Record<string, any> = lookups.providers ?? {};

  const cards: ConflictCardModel[] = conflicts.map((c) => {
    const show = c.show_id ? shows[c.show_id] : undefined;
    const otherShow = c.other_show_id ? shows[c.other_show_id] : undefined;
    const person = c.person_id ? people[c.person_id] : undefined;
    const role = c.role_id ? roles[c.role_id] : undefined;

    const primary = fmtShow(show);
    const secondary = fmtShow(otherShow);

    const bits: string[] = [];
    if (person?.display_name) bits.push(person.display_name);
    if (role?.name) bits.push(role.name);

    // Provider info comes from the show
    if (show?.provider_id && providers[show.provider_id]) {
      const p = providers[show.provider_id];
      bits.push(`Provider: ${p.name}`);
    }

    if (secondary?.when) {
      bits.push(`Other show: ${otherShow?.title ?? "Untitled"} (${secondary.when})`);
    }

    const windowLabel = primary?.when;
    const detail = bits.length ? bits.join(" · ") : undefined;

    return {
      id: c.id,
      headline: c.title,
      severityLabel: severityToLabel(c.severity),
      windowLabel,
      detail,
      raw: c.detail,
    };
  });

  const summary: ConflictSummaryModel = {
    total: cards.length,
    critical: cards.filter((x) => x.severityLabel === "Critical").length,
    warning: cards.filter((x) => x.severityLabel === "Warning").length,
    info: cards.filter((x) => x.severityLabel === "Info").length,
  };

  // Group cards by conflict_type-derived title
  const grouped = new Map<string, ConflictCardModel[]>();
  for (let i = 0; i < conflicts.length; i++) {
    const title = groupTitleFromType(conflicts[i].conflict_type);
    grouped.set(title, [...(grouped.get(title) ?? []), cards[i]]);
  }

  // Sort groups by max severity (Critical groups first), then by title
  const groups: ConflictGroupModel[] = Array.from(grouped.entries())
    .map(([title, items]) => ({ title, items }))
    .sort((a, b) => {
      const aMax = Math.max(...a.items.map((x) => labelRank(x.severityLabel)));
      const bMax = Math.max(...b.items.map((x) => labelRank(x.severityLabel)));
      if (aMax !== bMax) return bMax - aMax;
      return a.title.localeCompare(b.title);
    });

  return { summary, groups };
}