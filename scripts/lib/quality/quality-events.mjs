import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
} from 'node:fs';

import {
  nonEmptyLines,
  qualityEventPath,
  readRecentQualityEventLines,
} from './quality-event-log.mjs';
import {
  summarizeParsedQualityEvents,
} from './quality-event-summary.mjs';

export {
  appendQualityEvent,
  ensureQualityEventDir,
  qualityEventPath,
  readRecentQualityEventLines,
} from './quality-event-log.mjs';

function hashString(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseSinceTimestamp(since) {
  if (!since) {
    return null;
  }
  const timestamp = Date.parse(since);
  if (Number.isNaN(timestamp)) {
    throw new Error(`invalid --since timestamp: ${since}`);
  }
  return timestamp;
}

function eventTimestampMs(event) {
  const timestamp = Date.parse(event?.timestamp ?? '');
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function summarizeQualityEvents(repoRoot, options = {}) {
  const { limit = 200, since = null, slowLimit = 10 } = options;
  const eventPath = qualityEventPath(repoRoot);
  if (!existsSync(eventPath)) {
    return {
      totalRuns: 0,
      cacheHitRate: 0,
      slowest: [],
      modes: {},
    };
  }
  const sinceTimestamp = parseSinceTimestamp(since);
  const recentEventLines = sinceTimestamp === null
    ? readRecentQualityEventLines(eventPath, limit)
    : [];
  const events = sinceTimestamp === null
    ? recentEventLines.map((line) => JSON.parse(line))
    : nonEmptyLines(readFileSync(eventPath, 'utf8'))
      .map((line) => JSON.parse(line))
      .filter((event) => {
        const timestamp = eventTimestampMs(event);
        return timestamp !== null && timestamp >= sinceTimestamp;
      })
      .slice(-limit);
  return summarizeParsedQualityEvents(events, {
    since: since ?? null,
    slowLimit,
  });
}

export function cacheKeyDigest(value) {
  return hashString(value).slice(0, 12);
}
