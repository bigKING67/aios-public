import React from 'react';

export function formatNumericText(text: string): string {
  return text.replace(
    /([+\-]?)(\d{4,})(\.\d+)?(?=\s*(%|元|单|人|笔|件|次|个))/g,
    (_match, sign: string, intPart: string, decimalPart?: string) => {
      const numericText = `${intPart}${decimalPart || ''}`;
      const parsed = Number(numericText);
      if (!Number.isFinite(parsed)) {
        return `${sign}${numericText}`;
      }

      const decimals = decimalPart ? decimalPart.length - 1 : 0;
      const formatted = parsed.toLocaleString('zh-CN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      return `${sign}${formatted}`;
    }
  );
}

export function splitOverallSummaryToPoints(text: string): string[] {
  const normalized = text.replace(/\r?\n/g, '。').trim();
  if (!normalized) {
    return [];
  }

  const sentencePoints = normalized
    .split(/[。；;！!？?]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const mergedSentencePoints = sentencePoints.reduce<string[]>((acc, current) => {
    const isNumberedAction = /^[（(]?\d+[)）]\s*/.test(current);
    if (isNumberedAction && acc.length > 0) {
      const prev = acc[acc.length - 1];
      acc[acc.length - 1] = `${prev} ${current}`;
      return acc;
    }

    acc.push(current);
    return acc;
  }, []);

  if (mergedSentencePoints.length > 1) {
    return mergedSentencePoints.map((item) => formatNumericText(item));
  }

  // 保留编号动作句（如 1) 2) 3)）的完整性，避免被逗号拆成零碎行。
  if (/\d+[)）]\s*/.test(normalized)) {
    return [formatNumericText(normalized)];
  }

  const commaPoints = normalized
    .split(/[，]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (commaPoints.length >= 3) {
    return commaPoints.map((item) => formatNumericText(item));
  }

  return [formatNumericText(normalized)];
}

export function formatNumberedActionsForDisplay(text: string): string {
  const markerPattern = /[（(]?\d+[)）]\s*/g;
  const firstMarker = markerPattern.exec(text);
  if (!firstMarker) {
    return text;
  }

  const prefixBeforeFirstMarker = text.slice(0, firstMarker.index);
  const hangingIndent = '　'.repeat(prefixBeforeFirstMarker.length);

  let markerCount = 0;
  return text.replace(markerPattern, (marker) => {
    markerCount += 1;
    if (markerCount === 1) {
      return marker;
    }
    return `\n${hangingIndent}${marker}`;
  });
}

export function renderTextWithInlineBold(text: string): React.ReactNode {
  const source = text.trim();
  if (!source) {
    return '';
  }

  const tokens: Array<{ text: string; bold: boolean }> = [];
  const boldPattern = /\*\*([^*]+)\*\*/g;
  let cursor = 0;
  let match = boldPattern.exec(source);

  while (match) {
    const matchStart = match.index;
    const matchText = match[0];
    const innerText = match[1];

    if (matchStart > cursor) {
      tokens.push({
        text: source.slice(cursor, matchStart),
        bold: false,
      });
    }

    tokens.push({
      text: innerText,
      bold: true,
    });

    cursor = matchStart + matchText.length;
    match = boldPattern.exec(source);
  }

  if (cursor < source.length) {
    tokens.push({
      text: source.slice(cursor),
      bold: false,
    });
  }

  if (tokens.length === 0) {
    return source;
  }

  return tokens.map((token, index) =>
    token.bold ? <strong key={index}>{token.text}</strong> : <React.Fragment key={index}>{token.text}</React.Fragment>
  );
}
