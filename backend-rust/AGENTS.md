# Backend Rust Scope Guidelines

This file applies to `backend-rust/` and extends repository-level guidance for the Axum + SQLx backend.

## Scope

- Rust API service under `backend-rust/src`.
- Public API routes are wired in `backend-rust/src/routes.rs`; startup/bootstrap lives in `backend-rust/src/startup.rs`, with `backend-rust/src/main.rs` kept as the minimal process entrypoint.
- Backend-only scripts, load tests, and runtime docs under `backend-rust/`.

## Architecture Rules

- Keep public `/v1/*` API paths, query parameters, response shapes, cache behavior, and auth semantics backward-compatible unless a migration plan explicitly says otherwise.
- Do not add new business logic to legacy mega-files (`dashboard.rs`) or recreated root files such as `reports.rs` / `dataops.rs` / `roles.rs` / `users.rs`; extend the focused domain folders (`reports/`, `dataops/`, `dashboard/`, `roles/`, `users/`) or document why the change must stay local.
- Prefer this layering for new code:
  - `mod.rs`: router and module exports.
  - `handlers`: HTTP extraction, permissions, response wiring.
  - `queries` / `repository`: SQL construction and SQLx execution.
  - `domain` / `service`: business rules and transformations.
  - `types`: request/response/domain structs.
  - `cache` / `clients`: external dependencies and cache-specific code.
- Dynamic SQL must stay behind a small, named helper and must validate identifiers explicitly. User input goes through SQLx bind parameters whenever possible.
- Keep external integrations isolated by client boundary: Prefect, Feishu webhook, LLM providers, Dragonfly, and Postgres should not be called directly from unrelated handler code.

## Refactor Rules

- Split by behavior and data contract, not by arbitrary line count.
- Move pure functions and tests first, then handlers, then delete old glue. Keep each step compileable.
- When extracting modules from a legacy file, preserve existing function behavior before renaming or redesigning.
- Add tests around extracted pure logic before or during the move when the logic controls metric口径, cache keys, permissions, or response normalization.

## Validation

- Run ad-hoc Cargo work from the repository root through
  `bash scripts/backend-rust/cargo-with-cache.sh <command>`; direct Cargo
  commands bypass the canonical target and are not valid repository evidence.
- Cache lifecycle, budgets and explicit cleanup: `docs/BACKEND_CARGO_CACHE.md`.
  Keep builds/cleanup behind the wrapper's shared/exclusive lock; doctor never
  deletes Cargo targets. Do not delete the maintenance lock file.
- Backend-only changes select the smallest relevant checks from the following commands, completing required project gates; documentation-only edits do not automatically run Cargo:
  - `npm run verify:backend:fmt`
  - `npm run verify:backend:check`
  - `npm run verify:backend:test`
  - `npm run verify:backend:clippy`
  - `npm run verify:backend:size`
- Broad backend changes should run:
  - `npm run verify:backend`
  - `npm run verify:ci` when frontend/API contracts or deployment behavior may be affected.

## Done Criteria

- Behavior is verified on the affected API path or pure-function boundary.
- No new secrets, host-local env, or production-only credentials are committed.
- Legacy allowlisted Rust files do not grow unless the implementation also tightens the module boundary or the exception is explicitly justified.
- Any skipped backend check is reported with the exact command and blocker.
