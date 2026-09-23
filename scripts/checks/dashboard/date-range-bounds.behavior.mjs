#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import dayjs from 'dayjs';

const REPO_ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);

async function importDateRangeResolvers() {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'dashboard-date-range-bounds-'));
  const entryPath = path.join(tempDir, 'entry.ts');
  const outputPath = path.join(tempDir, 'bundle.mjs');

  writeFileSync(
    entryPath,
    [
      `export {`,
      `  clampCustomRangeToAvailableBounds,`,
      `  clampDateToAvailableBounds,`,
      `  resolveCurrentRange,`,
      `  resolvePreviousRange,`,
      `} from ${JSON.stringify(path.join(REPO_ROOT, 'apps/web-vite/src/app/dashboard/_components/dashboard-date-range-resolvers'))};`,
      '',
    ].join('\n'),
    'utf8'
  );

  await build({
    entryPoints: [entryPath],
    outfile: outputPath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    logLevel: 'silent',
  });

  try {
    return await import(pathToFileURL(outputPath).href);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function formatRange(range) {
  return {
    start: range.start.format('YYYY-MM-DD'),
    end: range.end.format('YYYY-MM-DD'),
  };
}

function formatTuple(range) {
  return range.map((item) => item.format('YYYY-MM-DD'));
}

const {
  clampCustomRangeToAvailableBounds,
  clampDateToAvailableBounds,
  resolveCurrentRange,
  resolvePreviousRange,
} = await importDateRangeResolvers();

const availableDateBounds = {
  minDate: dayjs('2025-01-01'),
  maxDate: dayjs('2026-06-08'),
};

const currentJuneRange = resolveCurrentRange(
  'month',
  dayjs('2026-06-09'),
  dayjs('2026-06-09'),
  dayjs('2026-06-01'),
  dayjs('2026-01-01'),
  [dayjs('2026-06-01'), dayjs('2026-06-09')],
  availableDateBounds
);

assert.deepEqual(
  formatRange(currentJuneRange),
  { start: '2026-06-01', end: '2026-06-08' },
  'month range should stop at the latest available database date'
);

assert.deepEqual(
  formatRange(resolvePreviousRange('month', currentJuneRange)),
  { start: '2026-05-01', end: '2026-05-08' },
  'previous month range should keep the same observed day count'
);

const currentMarchRange = resolveCurrentRange(
  'month',
  dayjs('2026-03-30'),
  dayjs('2026-03-30'),
  dayjs('2026-03-01'),
  dayjs('2026-01-01'),
  [dayjs('2026-03-01'), dayjs('2026-03-30')],
  {
    minDate: dayjs('2025-01-01'),
    maxDate: dayjs('2026-03-30'),
  }
);

assert.deepEqual(
  formatRange(resolvePreviousRange('month', currentMarchRange)),
  { start: '2026-02-01', end: '2026-02-28' },
  'previous month range should not spill past a shorter previous calendar month'
);

assert.deepEqual(
  formatRange(resolveCurrentRange(
    'month',
    dayjs('2026-07-01'),
    dayjs('2026-07-01'),
    dayjs('2026-07-01'),
    dayjs('2026-01-01'),
    [dayjs('2026-07-01'), dayjs('2026-07-31')],
    availableDateBounds
  )),
  { start: '2026-06-01', end: '2026-06-08' },
  'stale future month selection should resolve through the clamped picker month'
);

assert.deepEqual(
  formatRange(resolveCurrentRange(
    'month',
    dayjs('2024-12-01'),
    dayjs('2024-12-01'),
    dayjs('2024-12-01'),
    dayjs('2024-01-01'),
    [dayjs('2024-12-01'), dayjs('2024-12-31')],
    availableDateBounds
  )),
  { start: '2025-01-01', end: '2025-01-31' },
  'stale past month selection should resolve through the clamped picker month'
);

assert.equal(
  clampDateToAvailableBounds(dayjs('2026-06-09'), availableDateBounds).format('YYYY-MM-DD'),
  '2026-06-08',
  'day mode should clamp an unavailable selected day to maxDate'
);

assert.deepEqual(
  formatTuple(clampCustomRangeToAvailableBounds(
    [dayjs('2024-12-29'), dayjs('2026-06-09')],
    availableDateBounds,
    366
  )),
  ['2025-06-08', '2026-06-08'],
  'custom range should clamp to bounds and then preserve the max query day span'
);

assert.deepEqual(
  formatTuple(clampCustomRangeToAvailableBounds(
    [dayjs('2024-12-29'), dayjs('2025-01-03')],
    availableDateBounds,
    366
  )),
  ['2025-01-01', '2025-01-03'],
  'custom range should not allow dates before minDate'
);

console.log('[dashboard-date-range-bounds-behavior] OK');
