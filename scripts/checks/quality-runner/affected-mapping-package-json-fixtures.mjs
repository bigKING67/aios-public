import {
  assertPackageJsonReleaseAndDependencyBehavior,
} from './affected-mapping-package-json-release-fixtures.mjs';
import {
  assertPackageJsonScriptFastPathBehavior,
} from './affected-mapping-package-json-script-fixtures.mjs';

export function assertPackageJsonDiffBehavior({
  assertEqual,
  assertFalse,
  assertTrue,
}) {
  assertPackageJsonScriptFastPathBehavior({ assertFalse });
  assertPackageJsonReleaseAndDependencyBehavior({
    assertEqual,
    assertFalse,
    assertTrue,
  });
}
