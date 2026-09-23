import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  getQualityCacheRoot,
} from './quality-cache-paths.mjs';

const EVENTS_FILE = 'events.jsonl';

export function ensureQualityEventDir(repoRoot) {
  const root = getQualityCacheRoot(repoRoot);
  mkdirSync(root, { recursive: true });
  return root;
}

export function appendQualityEvent(repoRoot, event) {
  const root = ensureQualityEventDir(repoRoot);
  const eventPath = path.join(root, EVENTS_FILE);
  writeFileSync(eventPath, `${JSON.stringify(event)}\n`, {
    encoding: 'utf8',
    flag: 'a',
  });
}

export function qualityEventPath(repoRoot) {
  return path.join(getQualityCacheRoot(repoRoot), EVENTS_FILE);
}

export function nonEmptyLines(text) {
  return text.split(/\r?\n/).filter(Boolean);
}

export function readRecentQualityEventLines(eventPath, limit) {
  if (limit <= 0) {
    return nonEmptyLines(readFileSync(eventPath, 'utf8'));
  }

  const size = statSync(eventPath).size;
  if (size === 0) {
    return [];
  }

  const fd = openSync(eventPath, 'r');
  const chunks = [];
  let newlineCount = 0;
  let position = size;
  let totalBytes = 0;
  const chunkSize = 64 * 1024;

  try {
    while (position > 0 && newlineCount <= limit) {
      const bytesToRead = Math.min(chunkSize, position);
      position -= bytesToRead;
      const buffer = Buffer.allocUnsafe(bytesToRead);
      const bytesRead = readSync(fd, buffer, 0, bytesToRead, position);
      if (bytesRead <= 0) {
        break;
      }
      for (let index = 0; index < bytesRead; index += 1) {
        if (buffer[index] === 10) {
          newlineCount += 1;
        }
      }
      chunks.unshift(buffer.subarray(0, bytesRead));
      totalBytes += bytesRead;
    }
  } finally {
    closeSync(fd);
  }

  return nonEmptyLines(Buffer.concat(chunks, totalBytes).toString('utf8')).slice(-limit);
}
