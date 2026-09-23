#!/usr/bin/env node

import {
  checkDesignDocsDrift,
  formatDesignDocsDriftResult,
} from '../../lib/design/design-docs-drift-core.mjs';

const output = formatDesignDocsDriftResult(checkDesignDocsDrift());
if (output.stdout) {
  process.stdout.write(output.stdout);
}
if (output.stderr) {
  process.stderr.write(output.stderr);
}
if (output.status !== 0) {
  process.exit(output.status);
}
