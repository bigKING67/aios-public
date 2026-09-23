#!/usr/bin/env node

/**
 * verify:ci manifest semantic order audit.
 *
 * Generated-script and wiring guards prove that scripts/verify-ci.sh mirrors
 * the manifest and reaches every gate. This guard protects higher-level
 * ordering invariants that are easy to break while still staying generated.
 */

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  verifyCiManifestOrder,
  VERIFY_CI_MANIFEST_ORDER_GUARD_NAME,
} from '../../lib/ci/verify-ci-manifest-order-core.mjs';

export {
  verifyCiManifestOrder,
  VERIFY_CI_ADAPTER_GATE_NAMES,
  VERIFY_CI_MANIFEST_ORDER_GUARD_NAME,
  VERIFY_CI_PAIR_INVARIANTS,
  VERIFY_CI_POST_SHELL_GATE_NAMES,
  VERIFY_CI_TERMINAL_RUN_GATE_NAMES,
} from '../../lib/ci/verify-ci-manifest-order-core.mjs';

const { reportOk } = createCheckGuard(VERIFY_CI_MANIFEST_ORDER_GUARD_NAME, { errorPrefix: '' });

function main() {
  const findings = verifyCiManifestOrder();

  if (findings.length > 0) {
    console.error(`[${VERIFY_CI_MANIFEST_ORDER_GUARD_NAME}] verify:ci manifest order drift was detected:`);
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    console.error('\nKeep scripts/lib/ci/verify-ci-gates.mjs ordered by semantic dependency, not only generated output.');
    process.exit(1);
  }

  reportOk('manifest prefix, Tailwind, token-helper, pair, frontend delivery, terminal, and post-shell order invariants hold.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
