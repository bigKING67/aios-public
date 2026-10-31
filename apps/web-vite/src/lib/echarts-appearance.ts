import type { LobeAppearance } from '@lobehub/ui';

/**
 * ECharts draws on canvas, so it cannot follow CSS variables. Chart options are built from the
 * light token values (styles/echarts-theme.ts); in dark mode the chart wrappers pass them through
 * `adaptChartOptionToAppearance`, which swaps every light token color for its dark counterpart
 * (lobe gray dark neutrals, the --aios-* dark chart series and trends) and keeps alpha.
 */

type Rgb = readonly [number, number, number];

export const ECHARTS_DARK_COLOR_PAIRS: ReadonlyArray<readonly [light: string, dark: string]> = [
  // text
  ['#1F1F1F', '#E6E6E6'],
  ['#666666', '#B4B4B4'],
  ['#8A8A8A', '#8F8F8F'],
  ['#B0B0B0', '#6B6B6B'],
  // lines and soft surfaces
  ['#E3E3E3', '#202020'],
  ['#EEEEEE', '#1A1A1A'],
  ['#F8F8F8', '#1A1A1A'],
  // chart series, muted, trends (aios-theme.css dark values)
  ['#6E56CF', '#8B74F0'],
  ['#0E9C8E', '#1FA89A'],
  ['#C76E12', '#C9802F'],
  ['#2F6FE0', '#4C8DF6'],
  ['#C2417A', '#D45B8E'],
  ['#A8A8A8', '#5C5C5C'],
  ['#D9363E', '#FF6B6B'],
  ['#13A05A', '#4ADE80'],
  // ink used as a series
  ['#222222', '#EEEEEE'],
];

/**
 * Surface properties read some colors differently: white is the card surface there (but the text
 * on colored fills elsewhere), the ink-with-alpha tooltip stays a dark panel so its white text
 * keeps contrast, and ink-with-alpha shadows become black. `itemFill` is an `itemStyle.color`:
 * a white fill there draws a hollow mark (an estimate bar, a ring marker) on the card.
 */
const SURFACE_COLORS: Readonly<Record<string, ReadonlyArray<readonly [light: string, dark: string]>>> = {
  borderColor: [['#FFFFFF', '#0D0D0D']],
  areaColor: [['#FFFFFF', '#0D0D0D']],
  backgroundColor: [
    ['#FFFFFF', '#0D0D0D'],
    ['#1F1F1F', '#2E2E2E'],
  ],
  shadowColor: [['#1F1F1F', '#000000']],
  itemFill: [['#FFFFFF', '#0D0D0D']],
};

function parseHex(hex: string): Rgb {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as unknown as Rgb;
}

const key = (rgb: Rgb) => rgb.join(',');
const toRgbMap = (pairs: ReadonlyArray<readonly [string, string]>) =>
  new Map(pairs.map(([light, dark]) => [key(parseHex(light)), parseHex(dark)]));
const DARK_BY_RGB = toRgbMap(ECHARTS_DARK_COLOR_PAIRS);
const SURFACE_BY_RGB = new Map(Object.entries(SURFACE_COLORS).map(([property, pairs]) => [property, toRgbMap(pairs)]));

const HEX_PATTERN = /^#([0-9a-f]{6})$/i;
const RGBA_PATTERN = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

function toHex(rgb: Rgb): string {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function swapColor(value: string, property: string | undefined): string {
  const hex = HEX_PATTERN.exec(value.trim());
  const rgba = hex ? null : RGBA_PATTERN.exec(value.trim());
  if (!hex && !rgba) return value;
  const rgb: Rgb = hex ? parseHex(hex[0]) : [Number(rgba![1]), Number(rgba![2]), Number(rgba![3])];
  const dark = (property ? SURFACE_BY_RGB.get(property)?.get(key(rgb)) : undefined) ?? DARK_BY_RGB.get(key(rgb));
  if (!dark) return value;
  if (hex) return toHex(dark);
  return rgba![4] === undefined ? `rgb(${dark.join(', ')})` : `rgba(${dark.join(', ')}, ${rgba![4]})`;
}

function adapt(value: unknown, property: string | undefined): unknown {
  if (typeof value === 'string') return swapColor(value, property);
  if (Array.isArray(value)) {
    // Data arrays of numbers are the bulk of an option; skip them without copying.
    if (value.length > 0 && typeof value[0] === 'number') return value;
    let changed = false;
    const next = value.map((item) => {
      const adapted = adapt(item, property);
      if (adapted !== item) changed = true;
      return adapted;
    });
    return changed ? next : value;
  }
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    let changed = false;
    // Keep the prototype: ECharts gradients are class instances.
    const next = Object.create(Object.getPrototypeOf(value)) as Record<string, unknown>;
    for (const [entryKey, entry] of Object.entries(value)) {
      const adapted = adapt(entry, property === 'itemStyle' && entryKey === 'color' ? 'itemFill' : entryKey);
      if (adapted !== entry) changed = true;
      next[entryKey] = adapted;
    }
    return changed ? next : value;
  }
  return value;
}

export function adaptChartOptionToAppearance<T>(option: T, appearance: LobeAppearance): T {
  return appearance === 'dark' ? (adapt(option, undefined) as T) : option;
}
