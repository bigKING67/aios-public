import type { ECharts, EChartsCoreOption } from 'echarts/core';

interface LeanTooltipOption {
  formatter?: (params: unknown) => unknown;
  show?: boolean;
  trigger?: string;
}

interface LeanSetOptionOptions {
  lazyUpdate?: boolean;
  notMerge?: boolean;
}

interface EChartsPointerEvent {
  dataIndex?: unknown;
  event?: {
    event?: { offsetX?: unknown; offsetY?: unknown };
    offsetX?: unknown;
    offsetY?: unknown;
  };
  name?: unknown;
  seriesName?: unknown;
  value?: unknown;
}

interface LeanTooltipBinding {
  hide: () => void;
  move: (params: unknown) => void;
  node: HTMLDivElement;
  show: (params: unknown) => void;
}

const tooltipBindings = new WeakMap<ECharts, LeanTooltipBinding>();
const SAFE_TOOLTIP_TAG_PATTERN = /^(?:BR|DIV|EM|SPAN|STRONG)$/;
const UNSAFE_TOOLTIP_STYLE_PATTERN = /url\s*\(|expression|javascript:|@import|(?:position|transform|z-index)\s*:/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readTooltipOption(option: EChartsCoreOption): LeanTooltipOption | null {
  if (!isRecord(option)) {
    return null;
  }
  const tooltip = Array.isArray(option.tooltip) ? option.tooltip[0] : option.tooltip;
  return isRecord(tooltip) ? tooltip as LeanTooltipOption : null;
}

function withoutNativeTooltip(option: EChartsCoreOption): EChartsCoreOption {
  if (!isRecord(option)) {
    return option;
  }
  const leanOption = { ...option };
  delete leanOption.tooltip;
  delete leanOption.title;
  return leanOption as EChartsCoreOption;
}

function defaultTooltipContent(params: EChartsPointerEvent | EChartsPointerEvent[]): string {
  const first = Array.isArray(params) ? params[0] ?? {} : params;
  const name = escapeHtml(first.name || first.seriesName || '数据');
  const value = Array.isArray(first.value)
    ? first.value.map((valueItem) => escapeHtml(valueItem)).join(' / ')
    : escapeHtml(first.value);
  return `<strong>${name}</strong><br/>${value}`;
}

function formatTooltip(
  option: LeanTooltipOption,
  params: EChartsPointerEvent | EChartsPointerEvent[],
): string {
  if (typeof option.formatter === 'function') {
    const formatted = option.formatter(params);
    return typeof formatted === 'string' ? formatted : escapeHtml(formatted);
  }
  return defaultTooltipContent(params);
}

function readAxisLabel(option: Record<string, unknown>, dataIndex: number): unknown {
  for (const axisKey of ['xAxis', 'yAxis']) {
    const axisValue = option[axisKey];
    const axis = Array.isArray(axisValue) ? axisValue[0] : axisValue;
    if (!isRecord(axis) || !Array.isArray(axis.data)) {
      continue;
    }
    const label = axis.data[dataIndex];
    return isRecord(label) && 'value' in label ? label.value : label;
  }

  return undefined;
}

function buildAxisTooltipParams(
  option: EChartsCoreOption,
  pointerEvent: EChartsPointerEvent,
): EChartsPointerEvent[] {
  if (!isRecord(option) || !Number.isInteger(pointerEvent.dataIndex)) {
    return [pointerEvent];
  }

  const dataIndex = Number(pointerEvent.dataIndex);
  const seriesList = Array.isArray(option.series) ? option.series : [option.series];
  const axisValue = readAxisLabel(option, dataIndex) ?? pointerEvent.name;
  const params = seriesList.flatMap((seriesValue) => {
    if (
      !isRecord(seriesValue)
      || !Array.isArray(seriesValue.data)
      || (isRecord(seriesValue.tooltip) && seriesValue.tooltip.show === false)
      || dataIndex < 0
      || dataIndex >= seriesValue.data.length
    ) {
      return [];
    }

    const data = seriesValue.data[dataIndex];
    const value = isRecord(data) && 'value' in data ? data.value : data;
    const name = isRecord(data) && 'name' in data ? data.name : axisValue;

    return [{
      axisValueLabel: axisValue,
      dataIndex,
      name,
      seriesName: seriesValue.name,
      value,
    }];
  });

  return params.length ? params : [pointerEvent];
}

function sanitizeTooltipElement(element: HTMLElement): void {
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name === 'class' || attribute.name === 'title') {
      continue;
    }
    if (attribute.name === 'data-note-date' && /^\d{4}-\d{2}-\d{2}$/.test(attribute.value)) {
      continue;
    }
    if (attribute.name === 'style' && !UNSAFE_TOOLTIP_STYLE_PATTERN.test(attribute.value)) {
      continue;
    }
    element.removeAttribute(attribute.name);
  }
}

function setTooltipContent(node: HTMLDivElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html;

  for (const element of Array.from(template.content.querySelectorAll<HTMLElement>('*'))) {
    if (!element.parentNode) {
      continue;
    }
    if (!SAFE_TOOLTIP_TAG_PATTERN.test(element.tagName)) {
      element.replaceWith(document.createTextNode(element.textContent ?? ''));
      continue;
    }
    sanitizeTooltipElement(element);
  }

  node.replaceChildren(template.content.cloneNode(true));
}

function readPointerCoordinate(params: EChartsPointerEvent, axis: 'offsetX' | 'offsetY'): number {
  const direct = params.event?.[axis];
  const nested = params.event?.event?.[axis];
  const value = typeof direct === 'number' ? direct : nested;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function positionTooltip(binding: LeanTooltipBinding, params: EChartsPointerEvent): void {
  const host = binding.node.parentElement;
  if (!host) {
    return;
  }
  const left = readPointerCoordinate(params, 'offsetX') + 14;
  const top = readPointerCoordinate(params, 'offsetY') + 14;
  const maxLeft = Math.max(8, host.clientWidth - binding.node.offsetWidth - 8);
  const maxTop = Math.max(8, host.clientHeight - binding.node.offsetHeight - 8);
  const clampedLeft = Math.max(8, Math.min(left, maxLeft));
  const clampedTop = Math.max(8, Math.min(top, maxTop));
  binding.node.style.transform = `translate(${clampedLeft}px, ${clampedTop}px)`;
}

function disposeLeanEchartsTooltip(chart: ECharts): void {
  const previous = tooltipBindings.get(chart);
  if (!previous) {
    return;
  }

  chart.off('mouseover', previous.show);
  chart.off('mousemove', previous.move);
  chart.off('globalout', previous.hide);
  const host = previous.node.parentElement;
  previous.node.remove();
  host?.classList.remove('aios-echarts-tooltip-host');
  tooltipBindings.delete(chart);
}

export function disposeLeanEcharts(chart: ECharts): void {
  disposeLeanEchartsTooltip(chart);
  chart.dispose();
}

function bindLeanTooltip(
  chart: ECharts,
  option: EChartsCoreOption,
  tooltipOption: LeanTooltipOption | null,
): void {
  disposeLeanEchartsTooltip(chart);

  if (!tooltipOption || tooltipOption.show === false) {
    return;
  }

  const host = chart.getDom();
  host.classList.add('aios-echarts-tooltip-host');
  const node = document.createElement('div');
  node.className = 'aios-echarts-tooltip';
  node.setAttribute('role', 'tooltip');
  node.hidden = true;
  host.appendChild(node);

  const binding: LeanTooltipBinding = {
    node,
    hide: () => {
      node.hidden = true;
    },
    move: (params) => {
      if (!node.hidden) {
        positionTooltip(binding, params as EChartsPointerEvent);
      }
    },
    show: (params) => {
      const pointerEvent = params as EChartsPointerEvent;
      const formatterParams = tooltipOption.trigger === 'axis'
        ? buildAxisTooltipParams(option, pointerEvent)
        : pointerEvent;
      try {
        setTooltipContent(node, formatTooltip(tooltipOption, formatterParams));
      } catch {
        setTooltipContent(node, defaultTooltipContent(formatterParams));
      }
      node.hidden = false;
      positionTooltip(binding, pointerEvent);
    },
  };

  tooltipBindings.set(chart, binding);
  chart.on('mouseover', binding.show);
  chart.on('mousemove', binding.move);
  chart.on('globalout', binding.hide);
}

export function setLeanEchartsOption(
  chart: ECharts,
  option: EChartsCoreOption,
  setOptionOptions?: LeanSetOptionOptions,
): void {
  bindLeanTooltip(chart, option, readTooltipOption(option));
  chart.setOption(withoutNativeTooltip(option), setOptionOptions);
}
