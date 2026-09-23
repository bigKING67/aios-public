import {
  CREATOR_LIBRARY_CSV_CONTRACT_GATES,
  CREATOR_LIBRARY_FOLLOW_LOG_CONTRACT_GATES,
} from './quality-affected-gates.mjs';
import {
  isCreatorLibraryCsvContractFile,
  isCreatorLibraryFollowLogContractFile,
} from './quality-affected-path-rules.mjs';

export function creatorLibraryAffectedRule(file) {
  if (isCreatorLibraryCsvContractFile(file)) {
    return {
      gates: CREATOR_LIBRARY_CSV_CONTRACT_GATES,
      reason: `${file}: creator-library CSV/XLSX import-export contract impact`,
    };
  }

  if (isCreatorLibraryFollowLogContractFile(file)) {
    return {
      gates: CREATOR_LIBRARY_FOLLOW_LOG_CONTRACT_GATES,
      reason: `${file}: creator-library follow log timestamp contract impact`,
    };
  }

  return null;
}
