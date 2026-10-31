// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { initThemePreference, resolveAppearance, setThemePreference } from './theme-preference';

afterEach(() => {
  window.localStorage.clear();
  setThemePreference('light');
});

describe('theme preference', () => {
  it('defaults to light and applies the stored choice on init', () => {
    initThemePreference();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    window.localStorage.setItem('aios.appearance', 'dark');
    initThemePreference();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('remembers a choice and ignores unknown stored values', () => {
    setThemePreference('dark');
    expect(window.localStorage.getItem('aios.appearance')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    window.localStorage.setItem('aios.appearance', 'sepia');
    initThemePreference();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('resolves system to the color-scheme media query', () => {
    expect(resolveAppearance('light')).toBe('light');
    expect(resolveAppearance('dark')).toBe('dark');
    expect(['light', 'dark']).toContain(resolveAppearance('system'));
  });
});
