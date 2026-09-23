// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  createProductionCssModuleScopedName,
  resolveCssModulesOptions,
} from '../../../../scripts/build/vite-css-module-scoped-name';

describe('production CSS Module scoped names', () => {
  it('stays stable across repository locations and request suffixes', () => {
    const macGenerator = createProductionCssModuleScopedName('/Users/example/aios');
    const linuxGenerator = createProductionCssModuleScopedName('/srv/aios');

    const macName = macGenerator(
      'inspectorPanel',
      '/Users/example/aios/apps/web-vite/src/app/content.module.css?direct',
      '.inspectorPanel { display: grid; }',
    );
    const linuxName = linuxGenerator(
      'inspectorPanel',
      '/srv/aios/apps/web-vite/src/app/content.module.css',
      '.inspectorPanel { display: grid; }',
    );

    expect(macName).toBe(linuxName);
    expect(macName).toMatch(/^_[A-Za-z0-9_-]{6}[A-Za-z]+$/);
  });

  it('separates files and local class names deterministically', () => {
    const generateScopedName = createProductionCssModuleScopedName('/repo');
    const css = '.title { color: red; } .panel { display: grid; }';
    const first = generateScopedName('panel', '/repo/src/first.module.css', css);

    expect(generateScopedName('panel', '/repo/src/first.module.css', css)).toBe(first);
    expect(generateScopedName('panel', '/repo/src/second.module.css', css)).not.toBe(first);
    expect(generateScopedName('title', '/repo/src/first.module.css', css)).not.toBe(first);
  });

  it('keeps local tokens stable when selector order changes', () => {
    const generateScopedName = createProductionCssModuleScopedName('/repo');

    expect(generateScopedName('panel', '/repo/src/panel.module.css', '.title{} .panel{}')).toBe(
      generateScopedName('panel', '/repo/src/panel.module.css', '.panel{} .title{}'),
    );
  });

  it('fails closed for sources outside the repository', () => {
    const generateScopedName = createProductionCssModuleScopedName('/repo');

    expect(() => generateScopedName('panel', '/outside/panel.module.css', '.panel{}')).toThrow(
      'CSS Module source must stay inside the repository',
    );
  });

  it('keeps development class names on the Vite default path', () => {
    expect(resolveCssModulesOptions('development', '/repo')).toBeUndefined();
    expect(resolveCssModulesOptions('production', '/repo')?.generateScopedName).toBeTypeOf(
      'function',
    );
  });
});
