#!/usr/bin/env node

import {
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  CREATOR_LIBRARY_CSV_CONTRACT_GUARD_NAME,
  loadCreatorLibraryCsvContractSources,
  runCreatorLibraryCsvContractAssertions,
} from '../../lib/frontend/creator-library-csv-contract-core.mjs';

export {
  BACKEND_HANDLERS_SOURCES,
  BACKEND_TEMPLATE_XLSX_SOURCES,
  BACKEND_TYPES_SOURCE,
  CREATOR_LIBRARY_CSV_CONTRACT_GUARD_NAME,
  CREATOR_LIBRARY_CSV_CONTRACT_INPUTS,
  EXPECTED_EXPORT_HEADERS,
  EXPECTED_TEMPLATE_HEADERS,
  FRONTEND_CSV_SOURCE,
  loadCreatorLibraryCsvContractSources,
  parseRustConstCsvHeaders,
  parseRustStringArray,
  parseTsStringArray,
  runCreatorLibraryCsvContractAssertions,
} from '../../lib/frontend/creator-library-csv-contract-core.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard(CREATOR_LIBRARY_CSV_CONTRACT_GUARD_NAME);

const sources = loadCreatorLibraryCsvContractSources(getRepoRoot());
const message = runCreatorLibraryCsvContractAssertions(assertions, sources);
reportOk(message);
