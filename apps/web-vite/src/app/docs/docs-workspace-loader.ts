import type {
  DocsCard,
  DocsPageKey,
  DocsPageLink,
  DocsPageModel,
  DocsRow,
  DocsSection,
  DocsStep,
  DocsTable,
  DocsWorkspaceSnapshot,
} from './docs-workspace-contracts';

export const DOCS_WORKSPACE_SNAPSHOT_URL = '/docs/workspace-v1.json?v=aios-20260920';

const DOCS_PAGE_KEYS: DocsPageKey[] = [
  'home',
  'guide',
  'analysis-frameworks',
  'analysis-plans',
  'references',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new Error(`${context}.${key} must be a string`);
  }
  return value;
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${context}.${key} must be a string when present`);
  }
  return value;
}

function readStringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${context} must be a string array`);
  }
  return value;
}

function readOptionalArray<T>(
  record: Record<string, unknown>,
  key: string,
  context: string,
  parseItem: (value: unknown, context: string) => T,
): T[] | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${context}.${key} must be an array when present`);
  }
  return value.map((item, index) => parseItem(item, `${context}.${key}[${index}]`));
}

function readRecord(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value;
}

function parseRow(value: unknown, context: string): DocsRow {
  const record = readRecord(value, context);
  return {
    label: readString(record, 'label', context),
    value: readString(record, 'value', context),
  };
}

function parseCard(value: unknown, context: string): DocsCard {
  const record = readRecord(value, context);
  const tags = record.tags === undefined
    ? undefined
    : readStringArray(record.tags, `${context}.tags`);
  return {
    title: readString(record, 'title', context),
    desc: readString(record, 'desc', context),
    href: readOptionalString(record, 'href', context),
    action: readOptionalString(record, 'action', context),
    meta: readOptionalString(record, 'meta', context),
    tags,
    details: readOptionalArray(record, 'details', context, parseRow),
  };
}

function parseStep(value: unknown, context: string): DocsStep {
  const record = readRecord(value, context);
  return {
    title: readString(record, 'title', context),
    desc: readString(record, 'desc', context),
  };
}

function parseTable(value: unknown, context: string): DocsTable {
  const record = readRecord(value, context);
  const rawRows = record.rows;
  if (!Array.isArray(rawRows)) {
    throw new Error(`${context}.rows must be an array`);
  }
  return {
    title: readOptionalString(record, 'title', context),
    headers: readStringArray(record.headers, `${context}.headers`),
    rows: rawRows.map((row, index) => readStringArray(row, `${context}.rows[${index}]`)),
  };
}

function parseSection(value: unknown, context: string): DocsSection {
  const record = readRecord(value, context);
  const paragraphs = record.paragraphs === undefined
    ? undefined
    : readStringArray(record.paragraphs, `${context}.paragraphs`);
  return {
    id: readString(record, 'id', context),
    title: readString(record, 'title', context),
    lead: readOptionalString(record, 'lead', context),
    paragraphs,
    cards: readOptionalArray(record, 'cards', context, parseCard),
    steps: readOptionalArray(record, 'steps', context, parseStep),
    rows: readOptionalArray(record, 'rows', context, parseRow),
    tables: readOptionalArray(record, 'tables', context, parseTable),
  };
}

function parsePageKey(value: unknown, context: string): DocsPageKey {
  if (typeof value !== 'string' || !DOCS_PAGE_KEYS.includes(value as DocsPageKey)) {
    throw new Error(`${context} must be a known docs page key`);
  }
  return value as DocsPageKey;
}

function parsePage(value: unknown, context: string): DocsPageModel {
  const record = readRecord(value, context);
  const rawSections = record.sections;
  if (!Array.isArray(rawSections)) {
    throw new Error(`${context}.sections must be an array`);
  }

  let primaryAction: DocsPageModel['primaryAction'];
  if (record.primaryAction !== undefined) {
    const action = readRecord(record.primaryAction, `${context}.primaryAction`);
    primaryAction = {
      href: readString(action, 'href', `${context}.primaryAction`),
      label: readString(action, 'label', `${context}.primaryAction`),
    };
  }

  return {
    key: parsePageKey(record.key, `${context}.key`),
    path: readString(record, 'path', context),
    eyebrow: readString(record, 'eyebrow', context),
    title: readString(record, 'title', context),
    subtitle: readString(record, 'subtitle', context),
    primaryAction,
    sections: rawSections.map((section, index) => parseSection(section, `${context}.sections[${index}]`)),
  };
}

function parsePageLink(value: unknown, context: string): DocsPageLink {
  const record = readRecord(value, context);
  return {
    key: parsePageKey(record.key, `${context}.key`),
    href: readString(record, 'href', context),
    label: readString(record, 'label', context),
    helper: readString(record, 'helper', context),
  };
}

export function parseDocsWorkspaceSnapshot(value: unknown): DocsWorkspaceSnapshot {
  const record = readRecord(value, 'docsWorkspace');
  if (record.version !== 1) {
    throw new Error('docsWorkspace.version must be 1');
  }
  if (!Array.isArray(record.pageLinks)) {
    throw new Error('docsWorkspace.pageLinks must be an array');
  }

  const rawPages = readRecord(record.pages, 'docsWorkspace.pages');
  const pages = Object.fromEntries(DOCS_PAGE_KEYS.map((key) => [
    key,
    parsePage(rawPages[key], `docsWorkspace.pages.${key}`),
  ])) as Record<DocsPageKey, DocsPageModel>;
  const rawDetailPages = readRecord(record.detailPages, 'docsWorkspace.detailPages');
  const detailPages = Object.fromEntries(Object.entries(rawDetailPages).map(([key, page]) => [
    key,
    parsePage(page, `docsWorkspace.detailPages.${key}`),
  ]));

  return {
    version: 1,
    pageLinks: record.pageLinks.map((link, index) => parsePageLink(link, `docsWorkspace.pageLinks[${index}]`)),
    pages,
    detailPages,
  };
}

export async function loadDocsWorkspaceSnapshot(
  signal?: AbortSignal,
): Promise<DocsWorkspaceSnapshot> {
  const response = await fetch(DOCS_WORKSPACE_SNAPSHOT_URL, {
    cache: 'force-cache',
    signal,
  });
  if (!response.ok) {
    throw new Error(`Docs workspace snapshot request failed with HTTP ${response.status}`);
  }
  return parseDocsWorkspaceSnapshot(await response.json());
}
