#!/usr/bin/env node

/**
 * Repository naming contract audit.
 *
 * The current migration is intentionally phased. Only directories listed in
 * REPO_NAMING_ENFORCED_PATHS are fail-closed today; new migrated domains can be
 * added to that list after their files are normalized to lower-kebab-case.
 */

import {
  runRepoNamingCheck,
} from '../../lib/repo/repo-naming-core.mjs';

export {
  auditRepoNamingFile,
  auditRepoNamingFiles,
  formatRepoNamingFindings,
  listRepoNamingSourceFiles,
  runRepoNamingCheck,
} from '../../lib/repo/repo-naming-core.mjs';

if (import.meta.url === `file://${process.argv[1]}`) {
  runRepoNamingCheck();
}
