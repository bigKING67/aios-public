import { setLobeTheme, type LobeAppearance } from '@lobehub/ui';
import { useSyncExternalStore } from 'react';

/**
 * The viewer's appearance choice (DESIGN.md › Themes): follow the system, or force light / dark.
 * It is remembered per browser and applied through lobe-ui, which writes `data-theme` on <html>;
 * every `--lobe-*` and `--aios-*` color, the legacy-name bridge and the ECharts theme follow it.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'aios.appearance';
const DEFAULT_PREFERENCE: ThemePreference = 'light';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const listeners = new Set<() => void>();
let preference: ThemePreference = DEFAULT_PREFERENCE;

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

export function resolveAppearance(choice: ThemePreference): LobeAppearance {
  if (choice === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return choice;
}

function apply(): void {
  setLobeTheme({ appearance: resolveAppearance(preference) });
  listeners.forEach((listener) => listener());
}

/** Reads the stored choice, applies it, and follows system changes while the choice is `system`. */
export function initThemePreference(): void {
  if (typeof window === 'undefined') return;
  preference = readStoredPreference();
  apply();
  window.matchMedia?.(DARK_QUERY).addEventListener?.('change', () => {
    if (preference === 'system') apply();
  });
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage can be unavailable (private windows); the choice still applies to this page.
  }
  apply();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current choice and the appearance it resolves to; re-renders when either changes. */
export function useThemePreference(): { preference: ThemePreference; appearance: LobeAppearance } {
  const current = useSyncExternalStore(subscribe, () => preference, () => DEFAULT_PREFERENCE);
  const appearance = useSyncExternalStore(
    subscribe,
    () => resolveAppearance(preference),
    () => 'light' as LobeAppearance,
  );
  return { preference: current, appearance };
}
