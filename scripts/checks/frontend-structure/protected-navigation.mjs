#!/usr/bin/env node

/**
 * Protected route and navigation policy consistency audit.
 *
 * Route registration, page-level ProtectedRoute wrappers, Layout menu
 * visibility, and auth-navigation policy must describe the same protected
 * surface. This guard catches drift where a route is visible but not protected,
 * protected but not menu-tested, or auth-navigation silently defaults to allow.
 */

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runProtectedNavigationConsistencyCheck,
} from '../../lib/frontend/protected-navigation-consistency-check.mjs';

const guard = createCheckGuard('protected-navigation-consistency');
const {
  reportError,
  reportOk,
} = guard;

runProtectedNavigationConsistencyCheck(guard)
  .then((message) => reportOk(message))
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
