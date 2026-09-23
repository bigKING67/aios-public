import { inspect, isDeepStrictEqual } from 'node:util';

class CheckGuardAssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CheckGuardAssertionError';
  }
}

export function createCheckGuard(guardName, options = {}) {
  const { errorPrefix = 'ERROR: ' } = options;

  function fail(message) {
    console.error(`[${guardName}] ${errorPrefix}${message}`);
    process.exit(1);
  }

  function assert(condition, message) {
    if (!condition) {
      throw new CheckGuardAssertionError(message);
    }
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new CheckGuardAssertionError(
        `${message}; expected ${formatValue(expected)}, got ${formatValue(actual)}`,
      );
    }
  }

  function assertApprox(actual, expected, message, epsilon = 1e-9) {
    if (typeof actual !== 'number' || Math.abs(actual - expected) > epsilon) {
      throw new CheckGuardAssertionError(
        `${message}; expected ${formatValue(expected)}, got ${formatValue(actual)}`,
      );
    }
  }

  function assertDeepEqual(actual, expected, message) {
    if (!isDeepStrictEqual(actual, expected)) {
      throw new CheckGuardAssertionError(
        `${message}; expected ${formatValue(expected)}, got ${formatValue(actual)}`,
      );
    }
  }

  function assertTrue(value, message) {
    assertEqual(value, true, message);
  }

  function assertFalse(value, message) {
    assertEqual(value, false, message);
  }

  function assertSame(actual, expected, message) {
    if (actual !== expected) {
      throw new CheckGuardAssertionError(
        `${message}; expected same reference, got ${formatValue(actual)} and ${formatValue(expected)}`,
      );
    }
  }

  function assertKeys(actual, expectedKeys, message) {
    assertEqual(
      Object.keys(actual).sort().join(','),
      expectedKeys.slice().sort().join(','),
      message,
    );
  }

  function assertIncludes(actual, expectedSubstring, message) {
    if (!actual.includes(expectedSubstring)) {
      throw new CheckGuardAssertionError(
        `${message}; expected ${formatValue(actual)} to include ${formatValue(expectedSubstring)}`,
      );
    }
  }

  function assertNotIncludes(actual, unexpectedSubstring, message) {
    if (actual.includes(unexpectedSubstring)) {
      throw new CheckGuardAssertionError(
        `${message}; expected ${formatValue(actual)} to exclude ${formatValue(unexpectedSubstring)}`,
      );
    }
  }

  function reportOk(message = '') {
    console.log(message ? `[${guardName}] OK: ${message}` : `[${guardName}] OK`);
  }

  function reportError(error, fallbackMessage = 'unexpected runtime error') {
    if (error) {
      console.error(error instanceof Error ? error.message : error);
    }
    fail(fallbackMessage);
  }

  return {
    assert,
    assertApprox,
    assertDeepEqual,
    assertEqual,
    assertFalse,
    assertKeys,
    assertIncludes,
    assertNotIncludes,
    assertSame,
    assertTrue,
    fail,
    reportError,
    reportOk,
  };
}

function formatValue(value) {
  return inspect(value, {
    breakLength: 120,
    compact: true,
    depth: null,
    sorted: true,
  });
}
