export type TagCellVariant = 'audience' | 'sellingPoint';

const AUDIENCE_TAG_LEXICON = [
  '学生或白领',
  '新锐白领',
  '精致妈妈',
  '小镇青年',
  '资深中产',
  '黄皮姐妹',
  '年轻女性',
  '头皮敏感',
  '染发人群',
  '学生党',
  'Z世代',
  'genz',
  '学生',
  '白领',
] as const;

const SELLING_POINT_TAG_LEXICON = [
  '千元光能物养梳',
  '全新木养爱魔梳',
  '解决干枯毛躁',
  '改善干枯毛躁',
  '改善脱发掉发',
  '脱发掉发',
  '避免布丁头尴尬',
  '适合两段色三段色',
  '黑发直染显色',
  '五秒快速去油',
  '去头油',
  '不堵塞毛孔',
  '免洗洗发精',
  '免洗洗发巾',
  '赠送便携装',
  '赠送蓬发梳',
  '赠送修护发膜',
  '赠送气垫钢梳',
  '赠送洗头按摩梳',
  '赠送发圈',
  '改善发丝状态',
  '改善发质受损',
  '改善发质',
  '修护发丝',
  '修护受损',
  '修护受损发丝',
  '受损发质',
  '干枯毛躁',
  '改善毛躁',
  '修护发膜',
  '加送修护发膜',
  '去油护发一体',
  '油头',
  '在家轻松染发',
  '省钱染发',
  '两位数染发',
  '简单易染',
  '快速染发',
  '轻松上色',
  '快速换发色',
  '自然蓬松感',
  '控油蓬松',
  '头发蓬松',
  '清爽控油',
  '不油塌',
  '不贴头皮',
  '头皮控油',
  '头皮敏感',
  '敏感头皮',
  '头皮护理',
  '清爽头皮',
  '宠粉福利升级',
  '宠粉福利',
  '520情人节',
  '五二零情人节',
  '618大促',
  '618福利',
  '618特惠',
  '618限时',
  '五一特惠',
  '五一福利',
  '五一宠粉',
  '限时加赠',
  '拍一发四',
  '拍一发三',
  '买一送一',
  '香滑头发',
  '超值礼赠',
  '分叉打结',
  '改善分叉',
  '头发有韧性',
  '滋养头发',
  '头皮清爽',
  '浅发色人群',
  '适合多种颜色',
  '多种颜色',
  '学生或白领',
  '布丁头',
  '染发自由',
  '想换发色',
  '想要换发色',
  '不张扬',
  '耐看',
  '超显白',
  '显白显氛围',
  '无需褪色漂染',
  '染发增强头发韧度',
  '黄皮姐妹',
  '在家染发',
  '使用感好',
  '夏天使用',
  '夏日感十足',
  '夏日感',
  '在家享受千元头发spa',
  '上色快',
  '头发爱出油',
  '易出油',
  '头痒头臭',
  '毛躁受损',
  '在家享受',
  '头发spa',
  '根据烫染次数调整护理级别',
  '顺滑',
  '解决轻微毛躁',
  '改善干枯分叉',
  '解决断发',
  '沙发问题',
  '素颜出门无压力',
  '头发毛躁',
  '解决头发问题',
  '头发滋养',
  '效果好',
  '减少毛躁静电',
  '养护头皮',
  '解决头痒问题',
  '温和不刺激',
  '全面升级',
  '改善头发状况',
  '清新白花气息',
  '深入修护',
  '有效果的发膜',
  '爱烫染',
  '家庭护理',
  '4D仿生蛋白素',
  '扁塌发质',
  '亚洲发质',
  '深层修护',
  '套盒优惠',
  '奢养洗护',
  '超低价',
  '解决黏腻尴尬',
  '千元光能牧羊梳',
  '赠送千元雾氧按摩梳',
  '千元雾氧按摩梳',
  '赠送洗发水',
  '亮发膜',
  '亮精油',
  '多功能洗护套装',
  '宠粉',
  '送发膜',
] as const;

const AGE_RANGE_PATTERN = /\d{2}\s*[-–—]\s*\d{2}/gu;
const AUDIENCE_SIGNAL_PATTERN = /^(?:\d{2}-\d{2}|女|男)$/u;
const SPLIT_PATTERN = /[\s,，、;；/｜|+＋.!！?？:：()（）【】\[\]《》“”‘’~～…]+/u;
const TAG_MEANINGFUL_CHARACTER_PATTERN = /[\p{L}\p{N}]/u;
const TAG_EDGE_DECORATION_PATTERN = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;
const AUDIENCE_ROW_WIDTH_BUDGET = 288;
const AUDIENCE_MORE_CHIP_WIDTH = 48;
const AUDIENCE_CHIP_HORIZONTAL_PADDING = 18;
const AUDIENCE_CHIP_GAP = 6;
const AUDIENCE_CHIP_MAX_WIDTH = 104;
const SELLING_POINT_SPLIT_TRIGGER_LENGTH = 12;
const SELLING_POINT_ROW_WIDTH_BUDGET = 360;
const SELLING_POINT_MORE_CHIP_WIDTH = 48;
const SELLING_POINT_CHIP_HORIZONTAL_PADDING = 18;
const SELLING_POINT_CHIP_GAP = 6;
const SELLING_POINT_OVERFLOW_RESERVE_WIDTH = SELLING_POINT_MORE_CHIP_WIDTH + SELLING_POINT_CHIP_GAP;
const SELLING_POINT_COMPACT_CHIP_MAX_WIDTH = 132;
const SELLING_POINT_MEDIUM_CHIP_MAX_WIDTH = 220;
const SELLING_POINT_CJK_CHAR_WIDTH = 12;
const SELLING_POINT_LATIN_CHAR_WIDTH = 7;
const SELLING_POINT_SYMBOL_CHAR_WIDTH = 6;
const SELLING_POINT_WEAK_FRAGMENT_PATTERN =
  /^(?:的)?(?:姐妹们|姐妹|老婆们|老婆|美女姐妹们|美女姐妹|宝宝们|宝宝|宝子们|宝子|朋友们|朋友|人群|用户|女士|女孩|女生|家人们|家人|成分)$/u;
const SELLING_POINT_WEAK_LOOSE_SEGMENT_PATTERN = /^(?:避免|十足|千元|严重|尴尬|适合|想要|不失去|活动|优惠)$/u;
const SELLING_POINT_WEAK_INLINE_FRAGMENT_PATTERN =
  /(?:的(?:姐妹们|姐妹|老婆们|老婆|宝宝们|宝宝|宝子们|宝子|朋友们|朋友|人群|用户|女士|女孩|女生|家人们|家人)|(?:美女姐妹们|美女姐妹|老婆们|宝宝们|宝子们|朋友们|家人们|姐妹们))/gu;
const SELLING_POINT_WEAK_RESIDUE_PATTERN =
  /(?:姐妹们|姐妹|老婆们|老婆|宝宝们|宝宝|宝子们|宝子|朋友们|朋友|家人们|家人|女孩|女生|人群|用户|女士|必备|必入|可用|适用|推荐|同款|种草|好物|专属|发质|想要|不失去|的)/gu;
const TAG_PLACEHOLDER_PATTERN = /^(?:[-_./\\]+|n\/?a|null|undefined|none|暂无|无|没有|未提取|未识别|未知)$/iu;
const SELLING_POINT_TAG_LABEL_ALIASES: Record<string, string> = {
  五二零情人节: '520情人节',
  宠粉: '宠粉福利',
  想要换发色: '想换发色',
};

interface TagMatch {
  start: number;
  end: number;
  label: string;
}

export interface TagRowLayout {
  hiddenTags: string[];
  visibleRows: [string[], string[]];
}

export interface ResolvedTagGroup {
  hiddenTags: string[];
  tags: string[];
  visibleRows: [string[], string[]];
}

function normalizeTagText(value: string): string {
  return value.trim().replace(/\s+/g, '').replace(/[–—]/g, '-').replace(TAG_EDGE_DECORATION_PATTERN, '');
}

function isMeaningfulTag(tag: string): boolean {
  return TAG_MEANINGFUL_CHARACTER_PATTERN.test(tag);
}

function pushUnique(tags: string[], tag: string) {
  const normalized = normalizeTagText(tag);
  if (normalized && isMeaningfulTag(normalized) && !isTagPlaceholder(normalized) && !tags.includes(normalized)) {
    tags.push(normalized);
  }
}

function appendLooseSegment(tags: string[], segment: string) {
  const preparedSegment = segment.replace(/四\s*d\s*/giu, '4D');
  for (const part of preparedSegment.split(SPLIT_PATTERN)) {
    const normalized = normalizeTagText(part);
    if (normalized.length >= 2 && isMeaningfulTag(normalized)) {
      pushUnique(tags, normalized);
    }
  }
}

function findLexiconMatches(source: string, lexicon: readonly string[]): TagMatch[] {
  const matches: TagMatch[] = [];
  const lowerSource = source.toLocaleLowerCase();
  for (const token of lexicon) {
    const lowerToken = token.toLocaleLowerCase();
    let start = lowerSource.indexOf(lowerToken);
    while (start !== -1) {
      matches.push({
        start,
        end: start + token.length,
        label: token,
      });
      start = lowerSource.indexOf(lowerToken, start + token.length);
    }
  }
  return matches;
}

function findAudienceSignalMatches(source: string): TagMatch[] {
  const matches: TagMatch[] = [];
  for (const match of source.matchAll(AGE_RANGE_PATTERN)) {
    const matchedText = match[0];
    const start = match.index ?? 0;
    matches.push({
      start,
      end: start + matchedText.length,
      label: normalizeTagText(matchedText),
    });
  }
  for (const gender of ['女', '男']) {
    let start = source.indexOf(gender);
    while (start !== -1) {
      matches.push({ start, end: start + gender.length, label: gender });
      start = source.indexOf(gender, start + gender.length);
    }
  }
  return matches;
}

function resolveTagItems(value: string, lexicon: readonly string[], includeAudienceSignals = false): string[] {
  const source = value.trim();
  if (!source) {
    return [];
  }
  const matches = [
    ...findLexiconMatches(source, lexicon),
    ...(includeAudienceSignals ? findAudienceSignalMatches(source) : []),
  ].sort((left, right) => left.start - right.start || right.end - left.end);

  if (!matches.length) {
    const tags: string[] = [];
    appendLooseSegment(tags, source);
    return tags;
  }

  const tags: string[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) {
      continue;
    }
    appendLooseSegment(tags, source.slice(cursor, match.start));
    pushUnique(tags, match.label);
    cursor = match.end;
  }
  appendLooseSegment(tags, source.slice(cursor));
  return tags;
}

function estimateTagTextWidth(tag: string): number {
  return Array.from(tag).reduce((total, char) => {
    if (/[\u4e00-\u9fff]/u.test(char)) {
      return total + SELLING_POINT_CJK_CHAR_WIDTH;
    }
    if (/[a-z0-9]/iu.test(char)) {
      return total + SELLING_POINT_LATIN_CHAR_WIDTH;
    }
    return total + SELLING_POINT_SYMBOL_CHAR_WIDTH;
  }, 0);
}

function estimateCompactTagWidth(tag: string, horizontalPadding: number, maxWidth: number): number {
  return Math.min(estimateTagTextWidth(tag) + horizontalPadding, maxWidth);
}

function estimateAudienceTagWidth(tag: string): number {
  return estimateCompactTagWidth(tag, AUDIENCE_CHIP_HORIZONTAL_PADDING, AUDIENCE_CHIP_MAX_WIDTH);
}

function calculateCompactRowWidth(rowTags: string[], estimateTagWidth: (tag: string) => number, gap: number): number {
  if (!rowTags.length) {
    return 0;
  }
  const tagWidth = rowTags.reduce((total, tag) => total + estimateTagWidth(tag), 0);
  return tagWidth + Math.max(0, rowTags.length - 1) * gap;
}

function doesCompactRowFit({
  budget,
  estimateTagWidth,
  gap,
  hasOverflowChip = false,
  overflowReserveWidth,
  rowTags,
}: {
  budget: number;
  estimateTagWidth: (tag: string) => number;
  gap: number;
  hasOverflowChip?: boolean;
  overflowReserveWidth: number;
  rowTags: string[];
}): boolean {
  return (
    calculateCompactRowWidth(rowTags, estimateTagWidth, gap) + (hasOverflowChip ? overflowReserveWidth : 0) <=
    budget
  );
}

function findBestCompactRows({
  budget,
  estimateTagWidth,
  gap,
  hiddenCount,
  overflowReserveWidth,
  visibleTags,
}: {
  budget: number;
  estimateTagWidth: (tag: string) => number;
  gap: number;
  hiddenCount: number;
  overflowReserveWidth: number;
  visibleTags: string[];
}): [string[], string[]] | null {
  let bestRows: [string[], string[]] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let splitIndex = 1; splitIndex <= visibleTags.length; splitIndex += 1) {
    const firstRow = visibleTags.slice(0, splitIndex);
    const secondRow = visibleTags.slice(splitIndex);
    if (
      !doesCompactRowFit({ budget, estimateTagWidth, gap, overflowReserveWidth, rowTags: firstRow }) ||
      !doesCompactRowFit({
        budget,
        estimateTagWidth,
        gap,
        hasOverflowChip: hiddenCount > 0,
        overflowReserveWidth,
        rowTags: secondRow,
      })
    ) {
      continue;
    }

    const firstWidth = calculateCompactRowWidth(firstRow, estimateTagWidth, gap);
    const secondWidth =
      calculateCompactRowWidth(secondRow, estimateTagWidth, gap) + (hiddenCount > 0 ? overflowReserveWidth : 0);
    const score = Math.max(firstWidth, secondWidth) * 1000 + Math.abs(firstWidth - secondWidth);

    if (score < bestScore) {
      bestRows = [firstRow, secondRow];
      bestScore = score;
    }
  }

  return bestRows;
}

function buildWidthAwareAudienceFallbackRows(tags: string[]): TagRowLayout {
  if (!tags.length) {
    return { hiddenTags: [], visibleRows: [[], []] };
  }

  for (let visibleCount = tags.length; visibleCount >= 1; visibleCount -= 1) {
    const visibleTags = tags.slice(0, visibleCount);
    const hiddenCount = tags.length - visibleCount;
    const visibleRows = findBestCompactRows({
      budget: AUDIENCE_ROW_WIDTH_BUDGET,
      estimateTagWidth: estimateAudienceTagWidth,
      gap: AUDIENCE_CHIP_GAP,
      hiddenCount,
      overflowReserveWidth: AUDIENCE_MORE_CHIP_WIDTH + AUDIENCE_CHIP_GAP,
      visibleTags,
    });
    if (visibleRows) {
      return {
        hiddenTags: tags.slice(visibleCount),
        visibleRows,
      };
    }
  }

  return {
    hiddenTags: tags.slice(1),
    visibleRows: [[tags[0]], []],
  };
}

function buildAudiencePrimarySignalRows(primaryTags: string[], signalTags: string[]): TagRowLayout {
  let bestLayout: TagRowLayout | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let primaryVisibleCount = primaryTags.length; primaryVisibleCount >= 1; primaryVisibleCount -= 1) {
    const primaryRow = primaryTags.slice(0, primaryVisibleCount);
    const remainingPrimaryTags = primaryTags.slice(primaryVisibleCount);
    if (
      !doesCompactRowFit({
        budget: AUDIENCE_ROW_WIDTH_BUDGET,
        estimateTagWidth: estimateAudienceTagWidth,
        gap: AUDIENCE_CHIP_GAP,
        overflowReserveWidth: AUDIENCE_MORE_CHIP_WIDTH + AUDIENCE_CHIP_GAP,
        rowTags: primaryRow,
      })
    ) {
      continue;
    }

    for (
      let secondaryPrimaryVisibleCount = remainingPrimaryTags.length;
      secondaryPrimaryVisibleCount >= 0;
      secondaryPrimaryVisibleCount -= 1
    ) {
      const secondaryPrimaryRow = remainingPrimaryTags.slice(0, secondaryPrimaryVisibleCount);

      for (let signalVisibleCount = signalTags.length; signalVisibleCount >= 0; signalVisibleCount -= 1) {
        const signalRow = signalTags.slice(0, signalVisibleCount);
        const secondRow = [...secondaryPrimaryRow, ...signalRow];
        const hiddenTags = [
          ...remainingPrimaryTags.slice(secondaryPrimaryVisibleCount),
          ...signalTags.slice(signalVisibleCount),
        ];
        if (
          !doesCompactRowFit({
            budget: AUDIENCE_ROW_WIDTH_BUDGET,
            estimateTagWidth: estimateAudienceTagWidth,
            gap: AUDIENCE_CHIP_GAP,
            hasOverflowChip: hiddenTags.length > 0,
            overflowReserveWidth: AUDIENCE_MORE_CHIP_WIDTH + AUDIENCE_CHIP_GAP,
            rowTags: secondRow,
          })
        ) {
          continue;
        }

        const firstWidth = calculateCompactRowWidth(primaryRow, estimateAudienceTagWidth, AUDIENCE_CHIP_GAP);
        const secondWidth =
          calculateCompactRowWidth(secondRow, estimateAudienceTagWidth, AUDIENCE_CHIP_GAP) +
          (hiddenTags.length > 0 ? AUDIENCE_MORE_CHIP_WIDTH + AUDIENCE_CHIP_GAP : 0);
        const visibleScore = (primaryVisibleCount + secondaryPrimaryVisibleCount + signalVisibleCount) * 1_000_000;
        const signalScore = signalVisibleCount * 10_000;
        const primaryBackfillPenalty = secondaryPrimaryVisibleCount * 100;
        const balancePenalty = Math.max(firstWidth, secondWidth) * 1000 + Math.abs(firstWidth - secondWidth);
        const score = visibleScore + signalScore - primaryBackfillPenalty - balancePenalty;

        if (score > bestScore) {
          bestLayout = {
            hiddenTags,
            visibleRows: [primaryRow, secondRow],
          };
          bestScore = score;
        }
      }
    }
  }

  return bestLayout ?? {
    hiddenTags: [...primaryTags.slice(1), ...signalTags],
    visibleRows: [[primaryTags[0]], []],
  };
}

function buildAudienceRows(tags: string[]): TagRowLayout {
  const primaryTags = tags.filter((tag) => !AUDIENCE_SIGNAL_PATTERN.test(tag));
  const signalTags = tags.filter((tag) => AUDIENCE_SIGNAL_PATTERN.test(tag));

  if (primaryTags.length && signalTags.length) {
    return buildAudiencePrimarySignalRows(primaryTags, signalTags);
  }

  return buildWidthAwareAudienceFallbackRows(tags);
}

function isTagPlaceholder(tag: string): boolean {
  return TAG_PLACEHOLDER_PATTERN.test(normalizeTagText(tag));
}

function isWeakSellingPointFragment(tag: string): boolean {
  return SELLING_POINT_WEAK_FRAGMENT_PATTERN.test(tag) || SELLING_POINT_WEAK_LOOSE_SEGMENT_PATTERN.test(tag);
}

export function isLongSellingPointTag(tag: string): boolean {
  return isWideSellingPointTag(tag);
}

function shouldSplitKnownSellingPointPhrase(tag: string): boolean {
  return Array.from(tag).length > SELLING_POINT_SPLIT_TRIGGER_LENGTH;
}

export function estimateSellingPointNaturalTagWidth(tag: string): number {
  return estimateTagTextWidth(tag) + SELLING_POINT_CHIP_HORIZONTAL_PADDING;
}

export function isMediumSellingPointTag(tag: string): boolean {
  const naturalWidth = estimateSellingPointNaturalTagWidth(tag);
  return naturalWidth > SELLING_POINT_COMPACT_CHIP_MAX_WIDTH && naturalWidth <= SELLING_POINT_MEDIUM_CHIP_MAX_WIDTH;
}

export function isWideSellingPointTag(tag: string): boolean {
  return estimateSellingPointNaturalTagWidth(tag) > SELLING_POINT_MEDIUM_CHIP_MAX_WIDTH;
}

function normalizeSellingPointTagText(value: string): string {
  return normalizeTagText(value)
    .replace(/五二零/gu, '520')
    .replace(/六[一幺]八/gu, '618')
    .replace(/四d/giu, '4D')
    .replace(/扁塌(?:的)?亚洲人/gu, '扁塌发质')
    .replace(/扁塌(?:的)?亚洲人亚洲发质/gu, '扁塌发质亚洲发质');
}

function normalizeSellingPointLabel(value: string): string {
  const normalized = normalizeSellingPointTagText(value);
  return SELLING_POINT_TAG_LABEL_ALIASES[normalized] ?? normalized;
}

function isKnownSellingPointLabel(value: string): boolean {
  const normalized = normalizeSellingPointLabel(value);
  return SELLING_POINT_TAG_LEXICON.some((token) => normalizeSellingPointLabel(token) === normalized);
}

function selectNonOverlappingMatches(matches: TagMatch[]): TagMatch[] {
  const selectedMatches: TagMatch[] = [];
  let cursor = 0;

  for (const match of matches.sort((left, right) => left.start - right.start || right.end - left.end)) {
    if (match.start < cursor) {
      continue;
    }
    selectedMatches.push(match);
    cursor = match.end;
  }

  return selectedMatches;
}

function findSellingPointLexiconMatches(source: string): TagMatch[] {
  return selectNonOverlappingMatches(
    findLexiconMatches(normalizeSellingPointTagText(source), SELLING_POINT_TAG_LEXICON).map((match) => ({
      ...match,
      label: normalizeSellingPointLabel(match.label),
    }))
  );
}

function normalizeSellingPointSegment(value: string, { stripWeakResidue = false } = {}): string {
  const normalized = normalizeSellingPointLabel(value)
    .replace(SELLING_POINT_WEAK_INLINE_FRAGMENT_PATTERN, '')
    .replace(/的$/u, '');
  if (!stripWeakResidue || isKnownSellingPointLabel(normalized)) {
    return normalized;
  }
  return normalized.replace(SELLING_POINT_WEAK_RESIDUE_PATTERN, '');
}

function appendSellingPointLooseSegment(tags: string[], segment: string) {
  const normalizedSegment = segment.replace(/四\s*d\s*/giu, '4D');
  for (const part of normalizedSegment.split(SPLIT_PATTERN)) {
    const normalized = normalizeSellingPointSegment(part, { stripWeakResidue: true });
    if (normalized.length >= 2 && !isWeakSellingPointFragment(normalized) && !isTagPlaceholder(normalized)) {
      pushUnique(tags, normalized);
    }
  }
}

function expandSellingPointTag(tag: string): string[] {
  const normalized = normalizeSellingPointSegment(tag);
  const cleanedNormalized = normalizeSellingPointSegment(tag, { stripWeakResidue: true });
  if (!cleanedNormalized || isWeakSellingPointFragment(cleanedNormalized) || isTagPlaceholder(cleanedNormalized)) {
    return [];
  }

  const matches = findSellingPointLexiconMatches(normalized);
  if (matches.length >= 2 || (matches.length > 0 && shouldSplitKnownSellingPointPhrase(normalized))) {
    const expandedTags: string[] = [];
    let cursor = 0;
    for (const match of matches) {
      appendSellingPointLooseSegment(expandedTags, normalized.slice(cursor, match.start));
      pushUnique(expandedTags, match.label);
      cursor = match.end;
    }
    appendSellingPointLooseSegment(expandedTags, normalized.slice(cursor));
    return expandedTags;
  }

  return [cleanedNormalized];
}

function sanitizeSellingPointTags(tags: string[]): string[] {
  const sanitizedTags: string[] = [];
  for (const tag of tags) {
    for (const expandedTag of expandSellingPointTag(tag)) {
      pushUnique(sanitizedTags, expandedTag);
    }
  }
  return sanitizedTags;
}

function estimateSellingPointTagWidth(tag: string): number {
  if (isWideSellingPointTag(tag)) {
    return SELLING_POINT_ROW_WIDTH_BUDGET;
  }

  return Math.min(estimateSellingPointNaturalTagWidth(tag), SELLING_POINT_MEDIUM_CHIP_MAX_WIDTH);
}

function calculateSellingPointRowWidth(rowTags: string[]): number {
  if (!rowTags.length) {
    return 0;
  }
  const tagWidth = rowTags.reduce((total, tag) => total + estimateSellingPointTagWidth(tag), 0);
  return tagWidth + Math.max(0, rowTags.length - 1) * SELLING_POINT_CHIP_GAP;
}

function doesSellingPointRowFit(rowTags: string[], hasOverflowChip = false): boolean {
  const rowWidth = calculateSellingPointRowWidth(rowTags);
  if (!hasOverflowChip) {
    return rowWidth <= SELLING_POINT_ROW_WIDTH_BUDGET;
  }

  if (rowTags.length === 1 && isLongSellingPointTag(rowTags[0])) {
    return true;
  }

  return rowWidth + SELLING_POINT_OVERFLOW_RESERVE_WIDTH <= SELLING_POINT_ROW_WIDTH_BUDGET;
}

function findBestSellingPointRows(visibleTags: string[], hiddenCount: number): [string[], string[]] | null {
  let bestRows: [string[], string[]] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let splitIndex = 1; splitIndex <= visibleTags.length; splitIndex += 1) {
    const firstRow = visibleTags.slice(0, splitIndex);
    const secondRow = visibleTags.slice(splitIndex);
    if (!doesSellingPointRowFit(firstRow) || !doesSellingPointRowFit(secondRow, hiddenCount > 0)) {
      continue;
    }

    const firstWidth = calculateSellingPointRowWidth(firstRow);
    const secondWidth =
      calculateSellingPointRowWidth(secondRow) +
      (hiddenCount > 0 ? SELLING_POINT_OVERFLOW_RESERVE_WIDTH : 0);
    const score = Math.max(firstWidth, secondWidth) * 1000 + Math.abs(firstWidth - secondWidth);

    if (score < bestScore) {
      bestRows = [firstRow, secondRow];
      bestScore = score;
    }
  }

  return bestRows;
}

function buildWidthAwareSellingPointRows(tags: string[]): TagRowLayout {
  const displayableTags = sanitizeSellingPointTags(tags);
  if (!displayableTags.length) {
    return { hiddenTags: [], visibleRows: [[], []] };
  }

  for (let visibleCount = displayableTags.length; visibleCount >= 1; visibleCount -= 1) {
    const visibleTags = displayableTags.slice(0, visibleCount);
    const hiddenCount = displayableTags.length - visibleCount;
    const visibleRows = findBestSellingPointRows(visibleTags, hiddenCount);
    if (visibleRows) {
      return {
        hiddenTags: displayableTags.slice(visibleCount),
        visibleRows,
      };
    }
  }

  return {
    hiddenTags: displayableTags.slice(1),
    visibleRows: [[displayableTags[0]], []],
  };
}

function buildSellingPointRows(tags: string[]): TagRowLayout {
  return buildWidthAwareSellingPointRows(tags);
}

function buildTagRows(tags: string[], variant: TagCellVariant): TagRowLayout {
  return variant === 'audience' ? buildAudienceRows(tags) : buildSellingPointRows(tags);
}

export function resolveTagGroupCell(value: string, variant: TagCellVariant): ResolvedTagGroup {
  const isAudience = variant === 'audience';
  const resolvedTags = resolveTagItems(
    value,
    isAudience ? AUDIENCE_TAG_LEXICON : SELLING_POINT_TAG_LEXICON,
    isAudience
  );
  const tags = isAudience ? resolvedTags : sanitizeSellingPointTags(resolvedTags);
  const { hiddenTags, visibleRows } = buildTagRows(tags, variant);
  return { hiddenTags, tags, visibleRows };
}
