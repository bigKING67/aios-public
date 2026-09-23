import { readFileSync } from 'node:fs';
import path from 'node:path';

export const CREATOR_LIBRARY_FOLLOW_LOG_CONTRACT_GUARD_NAME = 'creator-library-follow-log-contract';

export const CREATOR_LIBRARY_FOLLOW_LOG_SOURCES = Object.freeze({
  createMutation: 'backend-rust/src/marketing/repository_follow_logs/mutation/create.rs',
  updateMutation: 'backend-rust/src/marketing/repository_follow_logs/mutation/update.rs',
  query: 'backend-rust/src/marketing/repository_follow_logs/query.rs',
  snapshot: 'backend-rust/src/marketing/repository_follow_logs/snapshot.rs',
  schemaCompat: 'backend-rust/src/schema_compat/creator_library_follow_log/table.rs',
  migration: 'etl/groland_postgres/sql/migrations/20260512_1030__influencer_library_follow_log_minute_timestamp.sql',
  sqlRegression: 'etl/groland_postgres/tests/sql/influencer_library_check.sql',
  followModal: 'apps/web-vite/src/app/marketing/creator-library/_components/creator-library-follow-modal.tsx',
  formatters: 'apps/web-vite/src/app/marketing/creator-library/_lib/creator-library-formatters.ts',
});

export const CREATOR_LIBRARY_FOLLOW_LOG_CONTRACT_INPUTS = Object.freeze(
  Object.values(CREATOR_LIBRARY_FOLLOW_LOG_SOURCES),
);

export const MINUTE_SHANGHAI_DEFAULT = "date_trunc('minute', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')";
export const MINUTE_DISPLAY_FORMAT = "TO_CHAR(followed_at, 'YYYY-MM-DD HH24:MI') AS followed_at";
export const MINUTE_DISPLAY_FORMAT_WITH_ALIAS = "TO_CHAR(follow_log.followed_at, 'YYYY-MM-DD HH24:MI') AS followed_at";
export const TIMESTAMP_TYPE = 'TIMESTAMP WITHOUT TIME ZONE';

export function compact(source) {
  return source.replace(/\s+/g, ' ');
}

function readSource(repoRoot, sourcePath) {
  return readFileSync(path.join(repoRoot, sourcePath), 'utf8');
}

export function loadCreatorLibraryFollowLogContractSources(repoRoot) {
  return Object.fromEntries(
    Object.entries(CREATOR_LIBRARY_FOLLOW_LOG_SOURCES).map(([key, sourcePath]) => [
      key,
      readSource(repoRoot, sourcePath),
    ]),
  );
}

export function runCreatorLibraryFollowLogContractAssertions(assertions, sources) {
  const {
    assertIncludes,
    assertNotIncludes,
  } = assertions;
  const {
    createMutation,
    updateMutation,
    query,
    snapshot,
    schemaCompat,
    migration,
    sqlRegression,
    followModal,
    formatters,
  } = sources;

  assertIncludes(
    schemaCompat,
    `followed_at ${TIMESTAMP_TYPE} NOT NULL DEFAULT ${MINUTE_SHANGHAI_DEFAULT}`,
    'schema bootstrap should create followed_at as a minute-level timestamp with Beijing-time default',
  );
  assertIncludes(
    schemaCompat,
    `ALTER COLUMN followed_at TYPE ${TIMESTAMP_TYPE}`,
    'schema bootstrap should migrate existing followed_at columns to timestamp without time zone',
  );
  assertIncludes(
    schemaCompat,
    `ALTER COLUMN followed_at SET DEFAULT ${MINUTE_SHANGHAI_DEFAULT}`,
    'schema bootstrap should keep the runtime default aligned with the migration default',
  );

  assertIncludes(
    migration,
    `ALTER COLUMN followed_at TYPE ${TIMESTAMP_TYPE}`,
    'migration should convert followed_at to timestamp without time zone',
  );
  assertIncludes(
    migration,
    `ALTER COLUMN followed_at SET DEFAULT ${MINUTE_SHANGHAI_DEFAULT}`,
    'migration should set followed_at to the same minute-level Beijing-time default',
  );
  assertIncludes(
    migration,
    'follow_log.followed_at::DATE AS last_followed_at',
    'migration should preserve the legacy last_followed_at snapshot as date-only',
  );

  assertIncludes(
    createMutation,
    MINUTE_SHANGHAI_DEFAULT,
    'create mutation should insert follow logs at minute precision in Beijing time',
  );
  assertIncludes(
    createMutation,
    MINUTE_DISPLAY_FORMAT,
    'create mutation should return minute-level display text',
  );
  assertIncludes(
    updateMutation,
    MINUTE_DISPLAY_FORMAT,
    'update mutation should return minute-level display text',
  );
  assertIncludes(
    query,
    MINUTE_DISPLAY_FORMAT_WITH_ALIAS,
    'follow history query should return minute-level display text',
  );
  assertIncludes(
    snapshot,
    'followed_at::DATE AS last_followed_at',
    'snapshot refresh should intentionally cast timestamp history back to date-only creator summary',
  );

  assertIncludes(
    sqlRegression,
    "data_type = 'timestamp without time zone'",
    'SQL regression should verify followed_at column type',
  );
  assertIncludes(
    sqlRegression,
    "column_default ILIKE '%date_trunc%'",
    'SQL regression should verify the minute-level default expression',
  );
  assertIncludes(
    sqlRegression,
    "column_default ILIKE '%Asia/Shanghai%'",
    'SQL regression should verify the Beijing-time default',
  );
  assertIncludes(
    sqlRegression,
    'follow_log.followed_at::DATE AS last_followed_at',
    'SQL regression should verify date-only snapshot semantics',
  );

  assertIncludes(
    followModal,
    'formatDateTimeText',
    'follow history modal should render full minute-level time, not date-only text',
  );
  assertNotIncludes(
    followModal,
    'formatDateText',
    'follow history modal should not use the date-only formatter',
  );
  assertIncludes(
    compact(followModal),
    "dataIndex: 'followedAt'",
    'follow history modal should keep the followedAt column wired to backend timestamp text',
  );
  assertIncludes(
    compact(followModal),
    'width: 168',
    'follow history date column should reserve enough width for YYYY/MM/DD HH:mm',
  );

  assertIncludes(
    formatters,
    'export function formatDateTimeText',
    'creator library formatter should expose a date-time formatter for follow history',
  );
  assertIncludes(
    compact(formatters),
    'return hour && minute ? `${dateText} ${hour}:${minute}` : dateText;',
    'date-time formatter should preserve HH:mm when backend returns minute-level text',
  );

  return 'creator-library follow log timestamp storage, SQL regression, and frontend rendering contracts are synchronized.';
}
