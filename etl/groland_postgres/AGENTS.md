# ETL Subproject Guidelines

This file applies to `etl/groland_postgres/` and overrides/extends repository-level guidance for this scope.

## Scope
- ETL code, SQL migrations, Prefect flows, and ETL operations scripts under this directory.

## Runtime & Tooling
- Use Linux + Bash for operational scripts.
- Prefer `uv` for Python environment and dependency workflows.
- Keep scripts non-interactive and automation-friendly.

## Common Commands
- `uv sync`
- `bash scripts/start_prefect_server.sh`
- `bash scripts/start_prefect_worker.sh`
- `bash scripts/deploy_prefect_dataops_hub_all.sh`

## SQL & Migration Rules
- Use `snake_case` naming.
- Use timestamped migration names like `20260210_1530__add_customer_index.sql`.
- Keep SQL keywords uppercase (`SELECT`, `JOIN`, `WHERE`).
- Prefer explicit column lists for `INSERT`.
- Use forward-only migration strategy.

## Prefect Stability
- Keep deployed flow/task names stable unless migration impact is explicitly planned.
- If flow/task renaming is necessary, document deployment mapping impact and rollback path.

## Validation
- Shell script changes: run `bash -n <script>`.
- Python changes: run `python3 -m py_compile <file.py>`.
- SQL/schema changes: add or update checks in `tests/sql/`.
- Start with minimal targeted checks, then expand by risk.

## Security
- Never hardcode credentials, tokens, or webhook URLs.
- Read required secrets from environment variables.
