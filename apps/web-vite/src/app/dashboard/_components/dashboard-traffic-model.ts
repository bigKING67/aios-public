import type { Key } from 'react';
import dayjs from 'dayjs';
import {
  formatCompactWanCurrency,
  formatTableInteger,
  formatTableNumber,
  formatTableRate,
} from './dashboard-formatters';
import type { NumericInput } from './dashboard-formatters';
import { compareNullableNumbers, compareText, toSortableNumber } from './dashboard-sorters';
import type {
  DashboardGoodsCardRow,
  DashboardGoodsCardTrafficTreeNode,
  DashboardTrafficGoodsTreeNode,
  DashboardTrafficMetricTriplet,
  DashboardTrafficTreeNode,
  GoodsCardFieldFormat,
  TrafficMetricFormat,
} from './dashboard-types';

export function formatTrafficMetricCurrentValue(
  metric: DashboardTrafficMetricTriplet,
  format: TrafficMetricFormat,
  digits = 2
): string {
  if (format === 'integer') {
    return formatTableInteger(metric.current);
  }
  if (format === 'rate') {
    return formatTableRate(metric.current);
  }
  if (format === 'currency') {
    const valueText = formatTableNumber(metric.current, digits);
    return valueText === '--' ? '--' : `¥${valueText}`;
  }
  return formatTableNumber(metric.current, digits);
}

export function formatDateTimeText(value: string | null | undefined): string {
  const normalized = value?.trim() || '';
  if (!normalized) {
    return '--';
  }

  const parsed = dayjs(normalized);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : normalized;
}

export function formatGoodsCardFieldValue(
  value: DashboardGoodsCardRow[keyof DashboardGoodsCardRow],
  format: GoodsCardFieldFormat,
  digits = 2
): string {
  if (format === 'integer') {
    return formatTableInteger(value as NumericInput);
  }
  if (format === 'rate') {
    return formatTableRate(value as NumericInput);
  }
  if (format === 'currency') {
    return formatCompactWanCurrency(value as NumericInput);
  }
  if (format === 'number') {
    return formatTableNumber(value as NumericInput, digits);
  }
  if (format === 'date') {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
      return '--';
    }
    const parsed = dayjs(normalized);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : normalized;
  }
  if (format === 'datetime') {
    return formatDateTimeText(typeof value === 'string' ? value : null);
  }
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text || '--';
}

export function collectGoodsCardTrafficExpandedRowKeys(
  nodes: DashboardGoodsCardTrafficTreeNode[] | null | undefined,
  maxSourceLevel = 2
): Key[] {
  if (!Array.isArray(nodes)) {
    return [];
  }

  const keys: Key[] = [];
  const visit = (items: DashboardGoodsCardTrafficTreeNode[]) => {
    items.forEach((item) => {
      if (item.children?.length && item.sourceLevel <= maxSourceLevel) {
        keys.push(item.key);
        visit(item.children);
      }
    });
  };

  visit(nodes);
  return keys;
}

function compareGoodsCardTrafficNodesByExposure(
  left: DashboardGoodsCardTrafficTreeNode,
  right: DashboardGoodsCardTrafficTreeNode
): number {
  return (
    compareNullableNumbers(right.metrics.cardExposureUserCount.current, left.metrics.cardExposureUserCount.current) ||
    compareNullableNumbers(right.metrics.cardClickUserCount.current, left.metrics.cardClickUserCount.current) ||
    compareNullableNumbers(right.metrics.cardUserPayAmount.current, left.metrics.cardUserPayAmount.current) ||
    compareText(left.sourceName, right.sourceName)
  );
}

export function sortGoodsCardTrafficTreeNodesByExposure(
  nodes: DashboardGoodsCardTrafficTreeNode[] | null | undefined
): DashboardGoodsCardTrafficTreeNode[] {
  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes
    .map((node) => ({
      ...node,
      children: node.children?.length ? sortGoodsCardTrafficTreeNodesByExposure(node.children) : node.children,
    }))
    .sort(compareGoodsCardTrafficNodesByExposure);
}

function shouldHideTrafficSourceNode(node: DashboardTrafficTreeNode): boolean {
  const sourceName = node.sourceName.trim();
  return sourceName === '未知来源' || sourceName === '未匹配二级来源';
}

function compareTrafficVisitorCountDesc(
  left: DashboardTrafficMetricTriplet | undefined,
  right: DashboardTrafficMetricTriplet | undefined
): number {
  const leftValue = toSortableNumber(left?.current ?? null);
  const rightValue = toSortableNumber(right?.current ?? null);

  if (leftValue === null && rightValue === null) {
    return 0;
  }
  if (leftValue === null) {
    return 1;
  }
  if (rightValue === null) {
    return -1;
  }
  return rightValue - leftValue;
}

export function filterTrafficTreeNodes(nodes: DashboardTrafficTreeNode[] | null | undefined): DashboardTrafficTreeNode[] {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  const normalizedNodes: DashboardTrafficTreeNode[] = [];
  for (const node of nodes) {
    if (shouldHideTrafficSourceNode(node)) {
      continue;
    }
    const filteredChildren = filterTrafficTreeNodes(node.children);
    normalizedNodes.push({
      ...node,
      children: filteredChildren.length > 0 ? filteredChildren : undefined,
    });
  }
  normalizedNodes.sort((left, right) =>
    compareTrafficVisitorCountDesc(left.metrics?.visitorCount, right.metrics?.visitorCount)
  );
  return normalizedNodes;
}

function shouldHideTrafficGoodsSourceNode(node: DashboardTrafficGoodsTreeNode): boolean {
  if (node.sourceLevel <= 0) {
    return false;
  }
  const sourceName = node.sourceName.trim();
  return sourceName === '未知来源' || sourceName === '未匹配二级来源';
}

export function filterTrafficGoodsTreeNodes(
  nodes: DashboardTrafficGoodsTreeNode[] | null | undefined
): DashboardTrafficGoodsTreeNode[] {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  const normalizedNodes: DashboardTrafficGoodsTreeNode[] = [];
  for (const node of nodes) {
    if (shouldHideTrafficGoodsSourceNode(node)) {
      continue;
    }
    const filteredChildren = filterTrafficGoodsTreeNodes(node.children);
    normalizedNodes.push({
      ...node,
      children: filteredChildren.length > 0 ? filteredChildren : undefined,
    });
  }
  normalizedNodes.sort((left, right) =>
    compareTrafficVisitorCountDesc(left.metrics?.visitorCount, right.metrics?.visitorCount)
  );
  return normalizedNodes;
}
