# ShowFlows – Architecture Decision Log

---

## 2026-02-25 – MVP Pro Conflict Scope

Decision:
MVP Pro conflict computation will operate within a single project only.

Why:
Minimizes SECURITY DEFINER blast radius, simplifies RLS boundaries, ensures deterministic compute, and allows fast Pro launch.

Tradeoffs:
No cross-project double-book detection in MVP.

Future Implication:
Cross-project availability detection will be implemented in Phase 2 Pro as a separate compute engine.