#!/usr/bin/env node

/**
 * Cross-layer contract for creator-library follow history timestamps.
 *
 * The history table stores minute-level local timestamps while the legacy
 * creator snapshot keeps its date-only field. Keep backend SQL, ETL migration,
 * regression SQL, and frontend rendering aligned.
 */

import {
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  CREATOR_LIBRARY_FOLLOW_LOG_CONTRACT_GUARD_NAME,
  loadCreatorLibraryFollowLogContractSources,
  runCreatorLibraryFollowLogContractAssertions,
} from '../../lib/frontend/creator-library-follow-log-contract-core.mjs';

export {
  CREATOR_LIBRARY_FOLLOW_LOG_CONTRACT_GUARD_NAME,
  CREATOR_LIBRARY_FOLLOW_LOG_CONTRACT_INPUTS,
  CREATOR_LIBRARY_FOLLOW_LOG_SOURCES,
  MINUTE_DISPLAY_FORMAT,
  MINUTE_DISPLAY_FORMAT_WITH_ALIAS,
  MINUTE_SHANGHAI_DEFAULT,
  TIMESTAMP_TYPE,
  compact,
  loadCreatorLibraryFollowLogContractSources,
  runCreatorLibraryFollowLogContractAssertions,
} from '../../lib/frontend/creator-library-follow-log-contract-core.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard(CREATOR_LIBRARY_FOLLOW_LOG_CONTRACT_GUARD_NAME);

const sources = loadCreatorLibraryFollowLogContractSources(getRepoRoot());
const message = runCreatorLibraryFollowLogContractAssertions(assertions, sources);
reportOk(message);
