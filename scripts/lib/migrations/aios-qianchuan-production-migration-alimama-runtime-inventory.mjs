import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const RUNTIME_ROOTS = Object.freeze([
  'apps/web-vite/src',
  'backend-rust/src',
  'etl/groland_postgres/scripts',
]);
const TEXT_EXTENSIONS = new Set(['.json', '.mjs', '.py', '.rs', '.sh', '.ts', '.tsx']);

export const ALIMAMA_LEGACY_RUNTIME_SYMBOLS = Object.freeze([
  'dwd_alimama_goods_marketing_di',
  'taobao_alimama_goods_marketingscene',
]);
export const ALIMAMA_CURRENT_RUNTIME_SYMBOLS = Object.freeze([
  'ods.taobao_one_alimama_goods_marketingscenario',
  'ads.report_taobao_one_goods_traffic_channel_metric_week',
  'ads.refresh_report_taobao_one_goods_traffic_channel_metric_week',
  'ads_report_taobao_one_goods_traffic_channel_metric_week_incremental',
  'incremental_refresh_report_taobao_one_goods_traffic_channel_metric_week_flow',
  'stream_report_taobao_one_goods_traffic_channel_metric_week',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function walkTextFiles(root, relativeRoot) {
  const absoluteRoot = path.join(root, relativeRoot);
  const result = [];
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeRoot, entry.name);
    if (entry.isDirectory()) result.push(...walkTextFiles(root, relativePath));
    else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) result.push(relativePath);
  }
  return result;
}

function collectMatches(content, relativePath, symbols) {
  return symbols.flatMap((symbol) => content.includes(symbol) ? [{ path: relativePath, symbol }] : []);
}

export function scanQianchuanAlimamaRuntimeConsumers({ root = process.cwd() } = {}) {
  const files = RUNTIME_ROOTS.flatMap((runtimeRoot) => walkTextFiles(root, runtimeRoot)).sort();
  const legacyMatches = [];
  const currentMatches = [];
  const snapshotRows = [];
  let bytesScanned = 0;
  for (const relativePath of files) {
    const absolutePath = path.join(root, relativePath);
    const bytes = statSync(absolutePath).size;
    const content = readFileSync(absolutePath, 'utf8');
    bytesScanned += bytes;
    legacyMatches.push(...collectMatches(content, relativePath, ALIMAMA_LEGACY_RUNTIME_SYMBOLS));
    currentMatches.push(...collectMatches(content, relativePath, ALIMAMA_CURRENT_RUNTIME_SYMBOLS));
    snapshotRows.push(`${relativePath}\0${bytes}\0${sha256(content)}`);
  }
  return {
    schemaVersion: 1,
    mode: 'offline_alimama_runtime_consumer_inventory',
    roots: [...RUNTIME_ROOTS],
    filesScanned: files.length,
    bytesScanned,
    snapshotSha256: sha256(snapshotRows.join('\n')),
    legacyMatches,
    currentMatches,
  };
}

export function validateQianchuanAlimamaRuntimeConsumerInventory(inventory) {
  if (inventory?.schemaVersion !== 1 || inventory.mode !== 'offline_alimama_runtime_consumer_inventory'
    || JSON.stringify(inventory.roots) !== JSON.stringify(RUNTIME_ROOTS)
    || !Number.isSafeInteger(inventory.filesScanned) || inventory.filesScanned < 1
    || !Number.isSafeInteger(inventory.bytesScanned) || inventory.bytesScanned < 1
    || !/^[a-f0-9]{64}$/u.test(inventory.snapshotSha256 ?? '')
    || !Array.isArray(inventory.legacyMatches) || !Array.isArray(inventory.currentMatches)) {
    throw new Error('Alimama runtime consumer inventory is invalid.');
  }
  for (const match of inventory.legacyMatches) {
    if (typeof match?.path !== 'string' || !match.path || typeof match?.symbol !== 'string' || !match.symbol) {
      throw new Error('Alimama runtime consumer inventory contains an invalid match.');
    }
    if (!ALIMAMA_LEGACY_RUNTIME_SYMBOLS.includes(match.symbol)
      || !RUNTIME_ROOTS.some((root) => match.path.startsWith(`${root}/`))) {
      throw new Error('Alimama runtime consumer inventory contains an out-of-scope legacy match.');
    }
  }
  for (const match of inventory.currentMatches) {
    if (typeof match?.path !== 'string' || !match.path || typeof match?.symbol !== 'string' || !match.symbol
      || !ALIMAMA_CURRENT_RUNTIME_SYMBOLS.includes(match.symbol)
      || !RUNTIME_ROOTS.some((root) => match.path.startsWith(`${root}/`))) {
      throw new Error('Alimama runtime consumer inventory contains an invalid current match.');
    }
  }
  return inventory;
}
