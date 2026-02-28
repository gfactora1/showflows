"use client";

import * as React from "react";
import { ConflictCard, ConflictCardModel } from "./ConflictCard";

export type ConflictGroupModel = {
  title: string;
  items: ConflictCardModel[];
};

export function ConflictGroupList({
  groups,
  emptyHint,
}: {
  groups: ConflictGroupModel[];
  emptyHint: string;
}) {
  if (!groups.length) {
    return (
      <div className="rounded-2xl border p-4">
        <div className="font-semibold">All clear</div>
        <div className="text-sm text-muted-foreground mt-1">{emptyHint}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.title} className="space-y-2">
          <div className="text-sm font-semibold">{g.title}</div>
          <div className="space-y-2">
            {g.items.map((c) => (
              <ConflictCard key={c.id} card={c} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}