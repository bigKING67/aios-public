import { mergeConfig } from 'vitest/config';

import coverageRatchet from '../../scripts/config/frontend/coverage-ratchet.json';
import { buildFrontendCoverageRatchetOptions } from '../../scripts/lib/frontend/frontend-coverage-ratchet-core.mjs';
import baseConfig from './vitest.config';

const ratchet = buildFrontendCoverageRatchetOptions(coverageRatchet);

export default mergeConfig(baseConfig, {
  test: {
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ratchet.include,
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage/frontend',
      thresholds: ratchet.thresholds,
    },
  },
});
