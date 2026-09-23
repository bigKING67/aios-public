import {
  validateQualityRunnerBehaviorDispatch,
} from './behavior-dispatch.mjs';
import {
  assertRegistryAggregateInputMetadata,
} from './registry-aggregate-input-fixtures.mjs';
import {
  assertRegistryLibGateGroupMetadata,
} from './registry-lib-gate-group-fixtures.mjs';
import {
  assertRegistryPrimaryCheckFileMetadata,
} from './registry-primary-check-file-fixtures.mjs';
import {
  assertRegistrySliceDefinitionMetadata,
} from './registry-slice-definition-fixtures.mjs';
import {
  assertRegistrySliceGateGroupMetadata,
} from './registry-slice-gate-group-fixtures.mjs';

export function assertRegistrySliceMetadata({
  assertDeepEqual,
  assertEqual,
  assertFalse,
  assertIncludes,
  assertTrue,
  registry,
}) {
  assertEqual(
    validateQualityRunnerBehaviorDispatch().join('\n'),
    '',
    'behavior dispatch metadata should stay synchronized with slice definitions',
  );
  assertRegistrySliceDefinitionMetadata({
    assertEqual,
    assertIncludes,
    assertTrue,
  });
  assertRegistryAggregateInputMetadata({
    assertIncludes,
    registry,
  });

  assertRegistrySliceGateGroupMetadata({
    assertDeepEqual,
  });

  assertRegistryLibGateGroupMetadata({
    assertFalse,
    assertTrue,
    registry,
  });
  assertRegistryPrimaryCheckFileMetadata({
    assertIncludes,
  });
}
