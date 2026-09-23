import {
  assertBehaviorDispatchAffectedMapping,
} from './affected-mapping-behavior-dispatch-fixtures.mjs';
import {
  assertCommandLayoutAffectedMapping,
} from './affected-mapping-command-layout-fixtures.mjs';
import {
  assertQualityRunnerAffectedSliceMapping,
} from './affected-mapping-runner-affected-fixtures.mjs';
import {
  assertReleaseAffectedMapping,
} from './affected-mapping-release-fixtures.mjs';
import {
  assertManifestAffectedMapping,
} from './affected-mapping-manifest-fixtures.mjs';
import {
  assertPrimarySliceCheckFileAffectedMapping,
} from './affected-mapping-primary-slice-fixtures.mjs';
import {
  assertQualityRunnerLibAffectedMapping,
} from './affected-mapping-runner-lib-fixtures.mjs';
import {
  assertRegistryFixtureAffectedMapping,
} from './affected-mapping-registry-fixtures.mjs';

export function assertQualityRunnerCoreAffectedMapping({
  assertExcludesAll,
  assertFalse,
  assertIncludesAll,
  assertTrue,
  registry,
}) {
  assertQualityRunnerLibAffectedMapping({
    assertExcludesAll,
    assertFalse,
    assertIncludesAll,
    assertTrue,
    registry,
  });

  assertRegistryFixtureAffectedMapping({
    assertExcludesAll,
    assertFalse,
    assertTrue,
    registry,
  });
  assertCommandLayoutAffectedMapping({
    assertExcludesAll,
    assertFalse,
    assertTrue,
    registry,
  });
  assertBehaviorDispatchAffectedMapping({
    assertFalse,
    assertIncludesAll,
    assertTrue,
    registry,
  });
  assertPrimarySliceCheckFileAffectedMapping({
    assertFalse,
    assertTrue,
    registry,
  });
  assertManifestAffectedMapping({
    assertTrue,
    registry,
  });

  assertQualityRunnerAffectedSliceMapping({
    assertExcludesAll,
    assertFalse,
    assertTrue,
    registry,
  });
  assertReleaseAffectedMapping({
    assertFalse,
    assertTrue,
    registry,
  });
}
