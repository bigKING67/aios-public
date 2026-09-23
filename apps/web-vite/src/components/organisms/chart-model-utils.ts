export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export function resolveNumericParamValue(value: unknown): number | undefined {
  const numericValue = Array.isArray(value) ? value.at(-1) : value;
  const resolvedValue = Number(numericValue);
  return Number.isFinite(resolvedValue) ? resolvedValue : undefined;
}

export function colorToRgb(color: string): RgbColor | null {
  const normalized = color.trim();

  const hex3Match = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(normalized);
  if (hex3Match) {
    return {
      r: parseInt(`${hex3Match[1]}${hex3Match[1]}`, 16),
      g: parseInt(`${hex3Match[2]}${hex3Match[2]}`, 16),
      b: parseInt(`${hex3Match[3]}${hex3Match[3]}`, 16),
    };
  }

  const hex6Match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized);
  if (hex6Match) {
    return {
      r: parseInt(hex6Match[1], 16),
      g: parseInt(hex6Match[2], 16),
      b: parseInt(hex6Match[3], 16),
    };
  }

  const rgbMatch = /^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(normalized);
  if (rgbMatch) {
    return {
      r: Math.min(255, parseInt(rgbMatch[1], 10)),
      g: Math.min(255, parseInt(rgbMatch[2], 10)),
      b: Math.min(255, parseInt(rgbMatch[3], 10)),
    };
  }

  return null;
}

export function resolveCssColor(rawColor: string, fallback?: string): string {
  const token = rawColor.trim();
  const varMatch = /^var\(\s*(--[^,\s)]+)\s*(?:,\s*([^)]+))?\)$/.exec(token);
  if (!varMatch) {
    return token || fallback || token;
  }

  const [, varName, fallbackColor] = varMatch;
  const resolved = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (resolved) {
    return resolved;
  }

  if (fallbackColor) {
    return resolveCssColor(fallbackColor.trim(), fallback);
  }

  return fallback || token;
}

export function createDebouncedResize(
  callback: () => void,
  delay: number
): { fn: () => void; cleanup: () => void } {
  let timeoutId: number | null = null;

  return {
    fn: () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        callback();
        timeoutId = null;
      }, delay);
    },
    cleanup: () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    },
  };
}
