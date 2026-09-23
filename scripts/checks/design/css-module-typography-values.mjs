#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runCssModuleTypographyValuesCheck,
} from '../../lib/design/css-module-typography-values-core.mjs';

runCssModuleTypographyValuesCheck(createCheckGuard('typography-value-audit'));
