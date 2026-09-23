import { readFileSync } from 'node:fs';
import path from 'node:path';

export const CREATOR_LIBRARY_CSV_CONTRACT_GUARD_NAME = 'creator-library-csv-contract';

export const FRONTEND_CSV_SOURCE = 'apps/web-vite/src/app/marketing/creator-library/_lib/creator-library-csv.ts';
export const FRONTEND_API_SOURCE = 'apps/web-vite/src/app/marketing/creator-library/_lib/creator-library-api.ts';
export const BACKEND_TYPES_SOURCE = 'backend-rust/src/marketing/types/constants.rs';
export const BACKEND_HANDLERS_SOURCES = Object.freeze([
  'backend-rust/src/marketing/handlers/mod.rs',
  'backend-rust/src/marketing/handlers/import_export/import.rs',
  'backend-rust/src/marketing/handlers/import_export/xlsx.rs',
]);
export const BACKEND_XLSX_IMPORT_SOURCES = Object.freeze([
  'backend-rust/src/xlsx.rs',
  'backend-rust/src/marketing/creator_library_xlsx/mod.rs',
  'backend-rust/src/marketing/creator_library_xlsx/parser.rs',
  'backend-rust/src/marketing/creator_library_xlsx/types.rs',
]);
export const BACKEND_TEMPLATE_XLSX_SOURCES = Object.freeze([
  'backend-rust/src/marketing/template_xlsx/constants.rs',
  'backend-rust/src/marketing/template_xlsx/help_sheet.rs',
  'backend-rust/src/marketing/template_xlsx/template_sheet.rs',
]);

export const CREATOR_LIBRARY_CSV_CONTRACT_INPUTS = Object.freeze([
  FRONTEND_CSV_SOURCE,
  FRONTEND_API_SOURCE,
  BACKEND_TYPES_SOURCE,
  ...BACKEND_HANDLERS_SOURCES,
  ...BACKEND_XLSX_IMPORT_SOURCES,
  ...BACKEND_TEMPLATE_XLSX_SOURCES,
]);

export const EXPECTED_TEMPLATE_HEADERS = Object.freeze([
  '达人ID',
  '达人昵称',
  '平台',
  '粉丝数',
  '主播标签',
  '达人等级',
  '近90天带货GMV',
  '合作状态',
  '归属BD',
]);

export const EXPECTED_EXPORT_HEADERS = Object.freeze([
  '达人ID',
  '达人昵称',
  '平台',
  '粉丝数',
  '主播标签',
  '达人等级',
  '近90天带货GMV',
  '合作状态',
  '归属BD',
  '最近跟进',
  '跟进历史',
  '合作描述',
]);

export function parseTsStringArray(source, constName) {
  const pattern = new RegExp(`export\\s+const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s+as\\s+const`);
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Unable to find TS const array: ${constName}`);
  }
  return Array.from(match[1].matchAll(/'([^']*)'/g), (item) => item[1]);
}

export function parseRustConstCsvHeaders(source, constName) {
  const pattern = new RegExp(
    `pub(?:\\([^)]*\\))?\\s+const\\s+${constName}\\s*:\\s*&str\\s*=\\s*"([^"]*)"`,
  );
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Unable to find Rust CSV const: ${constName}`);
  }
  return match[1].replace(/\\n$/, '').split(',');
}

export function parseRustStringArray(source, constName) {
  const pattern = new RegExp(
    `pub(?:\\([^)]*\\))?\\s+const\\s+${constName}\\s*:\\s*\\[&str;\\s*\\d+\\]\\s*=\\s*\\[([\\s\\S]*?)\\];`,
  );
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Unable to find Rust string array const: ${constName}`);
  }
  return Array.from(match[1].matchAll(/"([^"]*)"/g), (item) => item[1]);
}

function readSource(repoRoot, sourcePath) {
  return readFileSync(path.join(repoRoot, sourcePath), 'utf8');
}

function readSources(repoRoot, sourcePaths) {
  return sourcePaths.map((sourcePath) => readSource(repoRoot, sourcePath)).join('\n');
}

export function loadCreatorLibraryCsvContractSources(repoRoot) {
  return {
    backendHandlersSource: readSources(repoRoot, BACKEND_HANDLERS_SOURCES),
    backendSource: readSource(repoRoot, BACKEND_TYPES_SOURCE),
    backendTemplateXlsxSource: readSources(repoRoot, BACKEND_TEMPLATE_XLSX_SOURCES),
    backendXlsxImportSource: readSources(repoRoot, BACKEND_XLSX_IMPORT_SOURCES),
    frontendApiSource: readSource(repoRoot, FRONTEND_API_SOURCE),
    frontendSource: readSource(repoRoot, FRONTEND_CSV_SOURCE),
  };
}

export function runCreatorLibraryCsvContractAssertions(assertions, sources) {
  const {
    assertDeepEqual,
    assertIncludes,
    assertNotIncludes,
    assertTrue,
  } = assertions;
  const {
    backendHandlersSource,
    backendSource,
    backendTemplateXlsxSource,
    backendXlsxImportSource,
    frontendApiSource,
    frontendSource,
  } = sources;

  const frontendTemplateHeaders = parseTsStringArray(
    frontendSource,
    'CREATOR_LIBRARY_TEMPLATE_HEADERS',
  );
  const backendTemplateHeaders = parseRustConstCsvHeaders(backendSource, 'CSV_TEMPLATE');
  const backendTemplateHeaderArray = parseRustStringArray(
    backendSource,
    'CREATOR_LIBRARY_TEMPLATE_HEADERS',
  );
  const backendExportHeaders = parseRustConstCsvHeaders(backendSource, 'CSV_EXPORT_HEADER');

  assertDeepEqual(
    frontendTemplateHeaders,
    EXPECTED_TEMPLATE_HEADERS,
    'frontend creator-library import template headers should match the business import contract',
  );
  assertDeepEqual(
    backendTemplateHeaders,
    EXPECTED_TEMPLATE_HEADERS,
    'backend creator-library CSV-compatible template headers should match the frontend import template',
  );
  assertDeepEqual(
    backendTemplateHeaderArray,
    EXPECTED_TEMPLATE_HEADERS,
    'backend creator-library XLSX template headers should match the frontend import template',
  );
  assertDeepEqual(
    backendExportHeaders,
    EXPECTED_EXPORT_HEADERS,
    'backend creator-library export headers should match the current table columns without action column',
  );

  for (const header of ['操作', '下次跟进', '是否可合作', '跟进备注']) {
    assertTrue(
      !frontendTemplateHeaders.includes(header) &&
        !backendTemplateHeaders.includes(header) &&
        !backendTemplateHeaderArray.includes(header) &&
        !backendExportHeaders.includes(header),
      `creator-library template/export contracts should not include ${header}`,
    );
  }

  for (const header of ['近90天带货GMV', '归属BD']) {
    assertIncludes(
      frontendTemplateHeaders.join(','),
      header,
      `import template should include ${header}`,
    );
    assertIncludes(
      backendExportHeaders.join(','),
      header,
      `export should include ${header}`,
    );
  }

  assertNotIncludes(
    frontendTemplateHeaders.join(','),
    '合作描述',
    'import template should not import cooperation description; it is edited in the creator form',
  );
  assertNotIncludes(
    frontendTemplateHeaders.join(','),
    '跟进历史',
    'import template should not import follow history; history is maintained in the follow modal',
  );
  assertIncludes(
    frontendSource,
    'normalizeCreatorAnchorLevel(row.anchorLevel)',
    'frontend import should canonicalize anchor level aliases such as S/A/B/C/D before posting',
  );
  assertIncludes(
    frontendSource,
    'normalizeCooperationStatusValue(row.cooperationStatus)',
    'frontend import should canonicalize cooperation status aliases before posting',
  );
  assertIncludes(
    frontendSource,
    'isNotCooperableStatus(row.cooperationStatus)',
    'frontend import should treat X/不可合作 style status aliases as non-cooperable',
  );
  assertIncludes(
    backendExportHeaders.join(','),
    '跟进历史',
    'export should include follow history summary because it is a current table column',
  );
  assertIncludes(
    backendExportHeaders.join(','),
    '合作描述',
    'export should include cooperation description because it is a current table column',
  );
  assertIncludes(
    backendHandlersSource,
    '/template.xlsx',
    'backend should expose XLSX template download route',
  );
  assertIncludes(
    backendHandlersSource,
    '/import/parse-xlsx',
    'backend should expose the bounded XLSX parse route',
  );
  assertIncludes(
    backendHandlersSource,
    'ensure_write_permission(&current_user)',
    'XLSX parsing should require the same write scope as the final import',
  );
  assertIncludes(
    frontendSource,
    'parseCreatorLibraryXlsxFile(file)',
    'frontend XLSX uploads should delegate workbook parsing to the backend adapter',
  );
  assertNotIncludes(
    frontendSource,
    'read-excel-file',
    'frontend XLSX parsing should not reintroduce the browser workbook dependency',
  );
  assertIncludes(
    frontendApiSource,
    "formData.append('file', file)",
    'frontend XLSX adapter should send the closed multipart file field',
  );
  assertIncludes(
    frontendApiSource,
    'AIOS_API_PATHS.creatorLibraryParseXlsx',
    'frontend XLSX adapter should use the generated gateway-relative path',
  );
  assertIncludes(
    backendXlsxImportSource,
    'TEMPLATE_SHEET_NAME',
    'backend XLSX parser should prefer the canonical creator worksheet',
  );
  assertIncludes(
    backendXlsxImportSource,
    'sheet_names.first()',
    'backend XLSX parser should retain first-sheet fallback compatibility',
  );
  assertIncludes(
    backendXlsxImportSource,
    'MAX_CREATOR_LIBRARY_XLSX_BYTES',
    'backend XLSX parser should keep an explicit upload-size bound',
  );
  assertIncludes(
    backendTemplateXlsxSource,
    '主播类型等级策略表',
    'XLSX help sheet should include creator level strategy guide',
  );
  assertIncludes(
    backendTemplateXlsxSource,
    '主播标签参考值',
    'XLSX help sheet should include current anchor tag references',
  );
  assertIncludes(
    backendTemplateXlsxSource,
    '归属BD参考值',
    'XLSX help sheet should include current BD references',
  );
  assertIncludes(
    backendTemplateXlsxSource,
    '超头部、头部、肩部、中腰部、尾部',
    'XLSX template should explain the accepted creator level aliases',
  );
  assertIncludes(
    frontendSource,
    '达人ID不能为空',
    'frontend import preview should reject rows missing creator ID',
  );
  assertIncludes(
    backendHandlersSource,
    'ensure_import_creator_required_fields',
    'backend import endpoint should enforce creator ID even when callers bypass the UI',
  );
  assertIncludes(
    backendTemplateXlsxSource,
    '必填。达人在平台侧的唯一 ID。',
    'XLSX help sheet should mark creator ID as required',
  );
  assertNotIncludes(
    backendTemplateXlsxSource,
    '缺少达人ID时，按平台 + 达人昵称去重。',
    'XLSX help sheet should not advertise missing-ID fallback after creator ID became required',
  );

  return 'creator-library CSV/XLSX parse, template, and export contracts are synchronized.';
}
