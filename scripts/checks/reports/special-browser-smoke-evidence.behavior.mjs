#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runSpecialReportBrowserSmokeEvidenceBehaviorFixtures,
} from '../../lib/reports/special-report-browser-smoke-evidence-fixtures.mjs';

const { reportOk, ...assertions } = createCheckGuard(
  'special-report-browser-smoke-evidence-behavior',
);

const message = runSpecialReportBrowserSmokeEvidenceBehaviorFixtures(assertions);
reportOk(message);
