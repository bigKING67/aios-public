import type {
  LiveCenterAnalysisReviewTaskItem,
} from '../_lib/live-center-view-helpers';

export function mergeReviewActionItems(
  actionItems: LiveCenterAnalysisReviewTaskItem[],
  reviewTasks: LiveCenterAnalysisReviewTaskItem[]
): LiveCenterAnalysisReviewTaskItem[] {
  const merged: LiveCenterAnalysisReviewTaskItem[] = [];
  const seen = new Set<string>();
  [...actionItems, ...reviewTasks].forEach((item) => {
    const key = resolveReviewActionDedupKey(item);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    merged.push(item);
  });
  return merged;
}

export function resolveReviewActionDedupKey(item: LiveCenterAnalysisReviewTaskItem): string {
  const normalizedTitle = normalizeReviewActionText(item.title);
  const normalizedDetail = normalizeReviewActionText(item.detail);
  const evidenceKey = (item.evidenceRefs || '').trim().toLowerCase();
  if (normalizedTitle && normalizedDetail) {
    return `${normalizedTitle.slice(0, 80)}::${normalizedDetail.slice(0, 120)}::${evidenceKey}`;
  }
  return `${normalizedTitle || normalizedDetail}::${evidenceKey}`;
}

function normalizeReviewActionText(value: string): string {
  return value
    .replace(/\s+/g, '')
    .replace(/[。；;,.，、:：]/g, '')
    .replace(/^复核任务\d+/, '复核任务')
    .replace(/^行动\d+/, '行动')
    .toLowerCase();
}

export function isReviewTextDuplicate(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeReviewActionText(left ?? '');
  const normalizedRight = normalizeReviewActionText(right ?? '');
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  if (hasSharedReviewMetricSignal(normalizedLeft, normalizedRight)) {
    return true;
  }
  if (
    normalizedLeft.length > 18 &&
    normalizedRight.length > 18 &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  ) {
    return true;
  }
  return calculateTextShingleOverlap(normalizedLeft, normalizedRight) >= 0.58;
}

function hasSharedReviewMetricSignal(left: string, right: string): boolean {
  const leftNumbers = extractReviewNumbers(left);
  if (leftNumbers.size === 0) {
    return false;
  }
  const rightNumbers = extractReviewNumbers(right);
  const hasSharedNumber = [...leftNumbers].some((item) => rightNumbers.has(item));
  if (!hasSharedNumber) {
    return false;
  }
  const metricPattern = /转化|订单|下单|付款|成交|gmv|销售|客单|截单|链接|福利|投放|流量|销量|效率/;
  return metricPattern.test(left) && metricPattern.test(right);
}

function extractReviewNumbers(value: string): Set<string> {
  const matches = value.match(/\d+(?:\.\d+)?/g) ?? [];
  return new Set(matches);
}

function calculateTextShingleOverlap(left: string, right: string): number {
  const leftShingles = toTextShingles(left);
  const rightShingles = toTextShingles(right);
  if (leftShingles.size === 0 || rightShingles.size === 0) {
    return 0;
  }
  let matchedCount = 0;
  leftShingles.forEach((item) => {
    if (rightShingles.has(item)) {
      matchedCount += 1;
    }
  });
  return matchedCount / Math.min(leftShingles.size, rightShingles.size);
}

function toTextShingles(value: string): Set<string> {
  const normalized = value.length > 120 ? value.slice(0, 120) : value;
  const shingles = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    shingles.add(normalized.slice(index, index + 2));
  }
  return shingles;
}

export function formatPinnedActionDetail(value: string, duplicateContexts: Array<string | null | undefined> = []): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const compactedClauses = normalized
    .split(/[，,；;。]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !duplicateContexts.some((context) => isReviewTextDuplicate(item, context)));
  const actionableClauses = compactedClauses.filter(isPinnedActionableClause);
  const retainedClauses = actionableClauses.length > 0 ? actionableClauses : compactedClauses;
  const compacted = retainedClauses.length > 0
    ? `${retainedClauses.join('；')}。`
    : normalized;
  if (duplicateContexts.some((context) => isReviewTextDuplicate(compacted, context))) {
    return null;
  }
  const maxLength = 120;
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength)}...` : compacted;
}

function isPinnedActionableClause(value: string): boolean {
  return /复核|核对|排查|确认|调整|补齐|优化|标注|对齐|拆分|重跑|验证|检查|定位|沉淀|改写|收口/.test(value);
}

export function formatReaderPayloadStatusLabel(value: string): string {
  if (value === 'V4 结果不完整') {
    return '部分结构化，需复核';
  }
  if (value === 'V4 结果可用') {
    return '结构化结果可读';
  }
  if (value.startsWith('历史结果')) {
    return '历史结果可读';
  }
  return value.replace(/^V4\s*/, '结构化').replace('V4 结果', '结构化结果');
}
