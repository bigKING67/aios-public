# Marketing Content Assets backend module

This module owns the content-asset API surface under:

```text
/v1/marketing/content-assets
```

The main domain identity chain is:

```text
asset_id
  -> platform video / note / item identity
  -> ad material identity
  -> daily performance facts
  -> asset-level rollups
```

## Module map

```text
handlers.rs
  Axum routes, permission checks, request normalization, response assembly.

asset_mutations.rs
  Asset profile edits and manual upload request creation.

identity_mutations.rs
  Platform video/note identity, ad material identity, and unmatched-report binding.

identity_lookup.rs
  Read-only lookup helpers for platform identities and ad materials.

processing_mutations.rs
  Upload completion, derivative queues, AI analysis queues, transcript queues,
  processing-job retry, and processing-job cancellation.

repository.rs
  Read/query repository for list, detail, summary, filters, health, jobs, and
  unmatched statistics.

row_mapping.rs
  SQL row to API/domain DTO mapping.

delivery.rs
  TOS signed URL generation for upload, playback, and cover delivery.

mutation_types.rs
  Normalized write payloads used after validation.

types.rs
  API request/response/domain DTO structs.

validation.rs
  Boundary normalization and validation for API request payloads.

events.rs
  Asset event log writes.

performance.rs
  DB rollup function invocation for asset performance summaries.

guards.rs
  Existence, ownership, and update-result guards.

text_normalization.rs
  Shared text trimming and max-length normalization helpers.

write_errors.rs
  PostgreSQL write-error mapping to API errors.

mutation_repository.rs
  Compatibility facade only. Do not add new business logic here.
```

## Ownership rules

- Keep API route orchestration in `handlers.rs`; do not put SQL there unless it
  is route-local and clearly not reusable.
- Put write-side business logic in the matching `*_mutations.rs` module.
- Put read-side SQL in `repository.rs` or focused lookup modules.
- Put shared validation in `validation.rs`; write modules should receive
  normalized payloads from `mutation_types.rs`.
- Do not store object metadata as the source of truth in TOS. Database rows are
  the source of truth; TOS stores raw/preview/cover/frame/transcript/analysis
  objects and is referenced by bucket/object keys.
- Keep `asset_id` as the internal physical asset identity. Platform `video_id`,
  `note_id`, `item_id`, and ad `material_id` are external identities that map
  back to `asset_id`.

## Performance and data quality rules

- Daily platform/ad reports should enter ODS first, then be cleaned/matched into
  DWD and aggregated into DWS/ADS.
- Manual unmatched binding must update identity tables, mark DWD rows matched,
  and call the shared rollup function in `performance.rs`.
- Do not trigger video workers from API endpoints unless the endpoint explicitly
  says so. Queue creation is separate from worker execution.
- Playback should prefer preview objects and fall back to raw only when preview
  is missing.

## Extension checklist

When adding a new platform or performance source:

1. Add raw ODS ingestion and DWD normalization/matching outside this module.
2. Add identity lookup/bind support if the platform has new identity keys.
3. Reuse `performance.rs` for rollup refreshes.
4. Add API regression coverage for the new route or binding behavior.
5. Update this README if module responsibilities change.
