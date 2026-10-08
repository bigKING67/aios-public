import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import postcss, { type Root } from 'postcss';

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
  it('emits utilities backed by AIOS tokens and the custom card plugin', () => {
    expect(declarations('.p-4', 'padding')).toContain('var(--spacing-4)');
    expect(declarations('.text-text-primary', 'color')).toContain('var(--text-primary)');
    expect(declarations('.rounded-lg', 'border-radius')).toContain('var(--border-radius-lg)');
    expect(declarations('.card', 'background-color')).toContain('var(--bg-card)');
    expect(declarations('.card', 'padding')).toContain('var(--spacing-4)');
  });

  it('preserves the unlayered reset and utility cascade used with AntD', () => {
    let resetIndex = -1;
    let semanticLinkIndex = -1;
    let index = 0;
    css.walkRules((rule) => {
      if (rule.selector === 'a') {
        rule.walkDecls('color', (declaration) => {
          if (declaration.value === 'var(--brand-text)') semanticLinkIndex = index;
          if (declaration.value === 'inherit') {
            resetIndex = index;
            expect(rule.parent?.type).toBe('root');
          }
        });
      }
      if (rule.selector === '.p-4') expect(rule.parent?.type).toBe('root');
      index += 1;
    });
    expect(semanticLinkIndex).toBeGreaterThanOrEqual(0);
    expect(resetIndex).toBeGreaterThan(semanticLinkIndex);
    expect(declarations('*, ::before, ::after, ::backdrop, ::file-selector-button', 'border-color'))
      .toContain('var(--color-gray-200, currentColor)');
  });
});
