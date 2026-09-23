import {
  assertQualityRunnerAffectedActionMapping,
} from './affected-mapping-runner-affected-action-fixtures.mjs';
import {
  assertQualityRunnerAffectedSourceMapping,
} from './affected-mapping-runner-affected-source-fixtures.mjs';

export function assertQualityRunnerAffectedSliceMapping({
  assertExcludesAll,
  assertFalse,
  assertTrue,
  registry,
}) {
  assertQualityRunnerAffectedActionMapping({
    assertExcludesAll,
    assertFalse,
    assertTrue,
    registry,
  });
  assertQualityRunnerAffectedSourceMapping({
    assertExcludesAll,
    assertTrue,
    registry,
  });
}
