import {
  validateQianchuanAlimamaRuntimeRetirementDecisions,
} from './aios-qianchuan-production-migration-alimama-runtime-retirement-decisions.mjs';
import {
  validateQianchuanInfluencerTagForwardRepairDecisions,
} from './aios-qianchuan-production-migration-influencer-tag-forward-repair-decisions.mjs';
import {
  validateQianchuanProductionMigrationP1dForwardRepairDecisions,
} from './aios-qianchuan-production-migration-p1d-forward-repair-decisions.mjs';
import {
  validateQianchuanProductionMigrationP1dReviewDecisions,
} from './aios-qianchuan-production-migration-p1d-review-decisions.mjs';
import {
  validateQianchuanProductionMigrationOwnerDecisionArtifact as validateP1cOwnerDecisionArtifact,
} from './aios-qianchuan-production-migration-p1c-review-decisions.mjs';
import {
  validateQianchuanProductionMigrationReviewDecisions,
} from './aios-qianchuan-production-migration-review-decisions.mjs';

export function validateQianchuanProductionMigrationOwnerDecisionArtifact(decisions, options = {}) {
  if (decisions?.schemaVersion === 5
    && decisions.authorization?.newDecisionCohort === 'P1D_INFLUENCER_TAG_FORWARD_REPAIR') {
    return validateQianchuanInfluencerTagForwardRepairDecisions(decisions, options);
  }
  if (decisions?.schemaVersion === 4
    && decisions.authorization?.newDecisionCohort === 'P1D_RUNTIME_RETIREMENT') {
    return validateQianchuanAlimamaRuntimeRetirementDecisions(decisions, options);
  }
  if (decisions?.schemaVersion === 3
    && decisions.authorization?.newDecisionCohort === 'P1D_FORWARD_REPAIR') {
    return validateQianchuanProductionMigrationP1dForwardRepairDecisions(decisions, options);
  }
  if (decisions?.authorization?.newDecisionCohort === 'P1D') {
    return validateQianchuanProductionMigrationP1dReviewDecisions(decisions, options);
  }
  if (decisions?.schemaVersion === 1) {
    return validateQianchuanProductionMigrationReviewDecisions(decisions, options);
  }
  return validateP1cOwnerDecisionArtifact(decisions, options);
}
