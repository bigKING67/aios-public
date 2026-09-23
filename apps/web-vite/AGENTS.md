# AIOS Vite Frontend Guidelines

This file applies to `apps/web-vite/` and extends the repository-level `AGENTS.md`.

## Scope and authority

- `apps/web-vite/src/` is the only frontend application source root.
- Root `DESIGN.md` is mandatory for pages, components, CSS, charts, reports, responsive behavior, and interactions.
- Keep `@/*` mapped to `apps/web-vite/src/*`; do not reintroduce application code under root `src/`.

## Frontend execution contract

- For L1+ frontend work, run ~/.codex/tools/frontend_route_plan.sh after repository inspection. The planner owns tier/risk, authority, skill candidates, browser/native evidence, and visual-review requirements.
- Current frontend-route-v2 defaults to main-agent serial ownership. Tier alone never forces delegation.
- The authorization applies only to bounded frontend implementation or review work in the current task. It permits explicit parallel/review orchestration when the planner, task decomposition, non-overlapping boundaries, and benefit justify it; it does not require delegation.
- A project-authorized route must pass the absolute repository-root `AGENTS.md` path as delegation evidence. Only a successful spawn may be reported as enabled.
- Subagents may not run Git operations, inspect unrelated Chrome/profile data, perform external visible actions, or write outside their assigned boundary.
- If boundaries overlap or remain unclear, keep work with the main agent or use read-only exploration.
- Explicit style authority wins; otherwise the planner discovers root DESIGN.md. For visible changes, N/A is invalid.
- Current-baseline mode preserves DESIGN.md. Intentional design-language evolution requires explicit approval and the same change set must update DESIGN.md plus affected tokens/component contracts.
- Route candidate_skills are not automatically used. Select the smallest relevant chain; AIOS authority and source code outrank generic visual presets.
- For protected routes and browser evidence, follow docs/FRONTEND_BROWSER_SMOKE_RUNBOOK.md.

## Implementation

- Keep route-owned code under `src/app/<area>/`; promote code to shared `src/components`, `src/hooks`, or `src/lib` only with two current callers or an explicit migration contract.
- Reuse shared request/auth/session utilities and expose loading, error, empty, and permission states explicitly.
- Use lower-kebab-case source names, CSS Modules for route/component styles, and existing design tokens before local values.

## Validation

- 按改动选择 affected unit/behavior、lint、type-check、build 和相关 structure/design/performance gate；覆盖项目要求与实际风险，纯文档不自动执行应用构建，已通过且未受后续变更影响的结果可复用。
- Visible or broad routing changes require real browser/DOM validation under the repository browser smoke runbook.
- Public preview evidence is not authenticated or production evidence.
