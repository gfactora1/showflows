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
  if (label === "Critical") return 3;
  if (label === "Warning") return 2;
  return 1;
}

function groupTitleFromType(type: string): string {
  const t = (type ?? "").toLowerCase();
  if (t.includes("schedule") || t.includes("overlap") || t.includes("double")) return "Scheduling conflicts";
  if (t.includes("missing") && t.includes("role")) return "Missing required roles";
  if (t.includes("sound") || (t.includes("missing") && t.includes("provider"))) return "Missing sound provider";
  if (t.includes("unavailable")) return "Member unavailability";
  return "Other";
}

function fmtShow(show: any | undefined) {
  if (!show) return undefined;
  const when = `${new Date(show.starts_at).toLocaleString()} → ${new Date(show.ends_at).toLocaleString()}`;
  const where = [show.venue, show.city].filter(Boolean).join(" · ");
  return { when, where };
}

function formatDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")}${ampm}`;
}

function humanReadableDetail(conflictType: string, raw: any): string | undefined {
  if (!raw || Object.keys(raw).length === 0) return undefined;

  const t = (conflictType ?? "").toLowerCase();

  // Member unavailability
  if (t.includes("unavailable")) {
    const startDate = raw.block_start_date ? formatDate(raw.block_start_date) : null;
    const endDate = raw.block_end_date ? formatDate(raw.block_end_date) : null;
    const startTime = raw.block_start_time ? formatTime(raw.block_start_time) : null;
    const endTime = raw.block_end_time ? formatTime(raw.block_end_time) : null;

    const dateStr = startDate && endDate && startDate !== endDate
      ? `${startDate} — ${endDate}`
      : startDate ?? "Unknown date";

    const timeStr = startTime && endTime
      ? `${startTime} – ${endTime}`
      : "Full day";

    const noteStr = raw.note ? ` · "${raw.note}"` : "";

    return `Blocked: ${dateStr} · ${timeStr}${noteStr}`;
  }

  // Within-project double booking
  if (t.includes("double") && raw.scope === "within_project") {
    const overlapStart = raw.overlap_start
      ? new Date(raw.overlap_start).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : null;
    const overlapEnd = raw.overlap_end
      ? new Date(raw.overlap_end).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : null;
    if (overlapStart && overlapEnd) {
      return `Overlap: ${overlapStart} → ${overlapEnd}`;
    }
  }

  // Cross-project double booking
  if (t.includes("double") && raw.scope === "cross_project") {
    const overlapStart = raw.overlap_start
      ? new Date(raw.overlap_start).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : null;
    const overlapEnd = raw.overlap_end
      ? new Date(raw.overlap_end).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : null;
    const emailStr = raw.matched_email ? ` · Matched on ${raw.matched_email}` : "";
    if (overlapStart && overlapEnd) {
      return `Cross-project overlap: ${overlapStart} → ${overlapEnd}${emailStr}`;
    }
  }

  // Missing required role
  if (t.includes("missing") && t.includes("role")) {
    const required = raw.required_count ?? "?";
    const assigned = raw.assigned_count ?? 0;
    const missing = raw.missing_count ?? required - assigned;
    return `${assigned} of ${required} required assigned — ${missing} still needed`;
  }

  return undefined;
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

    if (show?.provider_id && providers[show.provider_id]) {
      const p = providers[show.provider_id];
      bits.push(`Provider: ${p.name}`);
    }

    if (secondary?.when) {
      bits.push(`Other show: ${otherShow?.title ?? "Untitled"} (${secondary.when})`);
    }

    const windowLabel = primary?.when;
    const detail = bits.length ? bits.join(" · ") : undefined;

    // Human-readable detail replaces raw JSON display
    const readableDetail = humanReadableDetail(c.conflict_type, c.detail);

    return {
      id: c.id,
      headline: c.title,
      severityLabel: severityToLabel(c.severity),
      windowLabel,
      detail,
      readableDetail,
      raw: undefined, // suppress raw JSON in UI
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

  // Sort groups by max severity then title
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
