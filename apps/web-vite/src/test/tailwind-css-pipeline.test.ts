// @vitest-environment jsdom
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import postcss, { type Root } from 'postcss';
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { Input, InputNumber, InputPassword, TextArea } from '@lobehub/ui';

let server: ViteDevServer;
let css: Root;

beforeAll(async () => {
  server = await createServer({
    configFile: path.resolve('apps/web-vite/vite.config.ts'),
    server: { middlewareMode: true, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const result = await server.transformRequest('/src/styles/globals.css');
  const serializedCss = result?.code.match(/const __vite__css = ("[^\n]*")/);
  if (!serializedCss) throw new Error('Vite did not emit the global stylesheet');
  css = postcss.parse(JSON.parse(serializedCss[1]));
  const theme = await server.transformRequest('/src/styles/aios-theme.css');
  const serializedTheme = theme?.code.match(/const __vite__css = ("[^\n]*")/);
  if (!serializedTheme) throw new Error('Vite did not emit the theme stylesheet');
  css.append(postcss.parse(JSON.parse(serializedTheme[1])));
}, 30_000);

afterAll(async () => { await server?.close(); });

function declarations(selector: string, property: string): string[] {
  const values: string[] = [];
  css.walkRules(selector, (rule) => {
    rule.walkDecls(property, (declaration) => { values.push(declaration.value); });
  });
  return values;
}

describe('Tailwind CSS production configuration', () => {
  it('gives filled and borderless fields an outer focus affordance without overriding invalid or disabled states', () => {
    const selectors: string[] = [];
    css.walkRules((rule) => {
      rule.walkDecls('box-shadow', (declaration) => {
        if (declaration.value.includes('--lobe-color-primary-bg')) selectors.push(rule.selector);
      });
    });
    const hasOuterFocus = (root: HTMLElement) => selectors.some((selector) => root.matches(selector));
    for (const variant of ['filled', 'borderless', 'outlined'] as const) {
      const { container } = render(createElement(Input, { variant }));
      const input = container.querySelector('input')!;
      const root = input.parentElement!;
      input.focus();
      expect(hasOuterFocus(root)).toBe(true);
      input.setAttribute('aria-invalid', 'true');
      expect(hasOuterFocus(root)).toBe(false);
      input.removeAttribute('aria-invalid');
      root.setAttribute('data-disabled', '');
      expect(hasOuterFocus(root)).toBe(false);
      cleanup();
    }
  });

  it('keeps native focus visible without painting a second ring inside composite fields', () => {
    const ringSelectors: string[] = [];
    css.walkRules((rule) => {
      rule.walkDecls('box-shadow', (declaration) => {
        if (declaration.value.includes('--lobe-focus-ring-color')) ringSelectors.push(rule.selector);
      });
    });
    const baseRingMatches = (input: HTMLElement) => ringSelectors.some((selector) => {
      try { return input.matches(selector); } catch { return false; }
    });
    const native = document.createElement('input');
    document.body.append(native);
    native.focus();
    expect(baseRingMatches(native)).toBe(true);
    native.remove();

    for (const field of [createElement(Input), createElement(InputNumber), createElement(InputPassword), createElement(TextArea)]) {
      const { container } = render(field);
      const input = container.querySelector<HTMLElement>('input:not([aria-hidden]), textarea')!;
      input.focus();
      expect(document.activeElement).toBe(input);
      expect(baseRingMatches(input)).toBe(false);
      cleanup();
    }
  });

  it('emits utilities backed by AIOS tokens and the custom card plugin', () => {
    expect(declarations('.p-4', 'padding')).toContain('var(--spacing-4)');
    expect(declarations('.text-text-primary', 'color')).toContain('var(--text-primary)');
    expect(declarations('.rounded-lg', 'border-radius')).toContain('var(--border-radius-lg)');
    expect(declarations('.card', 'background-color')).toContain('var(--bg-card)');
    expect(declarations('.card', 'padding')).toContain('var(--spacing-4)');
  });

  it('layers element resets below lobe-ui and keeps utilities unlayered', () => {
    const order = css.nodes.find(
      (node) => node.type === 'atrule' && node.name === 'layer' && !node.nodes && node.params.includes('lobe-ui'),
    );
    // design-system-base, then preflight (which still wins over it), all below the lobe-ui layers.
    expect(order && 'params' in order ? order.params.replace(/\s+/g, '') : '').toBe(
      'theme,aios-base,reset,lobe-base,lobe-popup,lobe-ui',
    );
    const layerOf = (rule: { parent?: unknown }): string => {
      const parent = rule.parent as { type?: string; name?: string; params?: string } | undefined;
      return parent?.type === 'atrule' && parent.name === 'layer' ? (parent.params ?? '') : 'unlayered';
    };
    const linkLayers = new Map<string, string>();
    css.walkRules('a', (rule) => {
      rule.walkDecls('color', (declaration) => { linkLayers.set(declaration.value, layerOf(rule)); });
    });
    expect(linkLayers.get('var(--aios-ai-text)')).toBe('aios-base');
    expect(linkLayers.get('inherit')).toBe('reset');
    css.walkRules('.p-4', (rule) => { expect(layerOf(rule)).toBe('unlayered'); });
    const borderRules: string[] = [];
    css.walkRules('*, ::before, ::after, ::backdrop, ::file-selector-button', (rule) => {
      rule.walkDecls('border-color', (declaration) => {
        if (declaration.value === 'var(--color-gray-200, currentColor)') borderRules.push(layerOf(rule));
      });
    });
    expect(borderRules).toEqual(['reset']);
  });
});
