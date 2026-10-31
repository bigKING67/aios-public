import { readFileSync } from 'node:fs';
import path from 'node:path';
import postcss, { type Root } from 'postcss';
import { describe, expect, it } from 'vitest';

const LIGHT = 'html:root';
const DARK = "html:root[data-theme='dark']";
// Designed to stay identical in both themes (DESIGN.md Visual Language v2: AI fill keeps white
// text at 5:1, the media stage is dark everywhere). Dark-only overrides of these would be a bug.
const THEME_INVARIANT = new Set([
  '--aios-ai-fill',
  '--aios-ai-fill-hover',
  '--aios-ai-on-fill',
  '--aios-stage',
  '--aios-stage-text',
]);
const RAW_COLOR = /#[0-9a-f]{3,8}\b|rgba?\(/i;

const theme = postcss.parse(readFileSync(path.resolve('apps/web-vite/src/styles/aios-theme.css'), 'utf8'));
const lobeTheme = readFileSync(path.resolve('node_modules/@lobehub/ui/es/theme.css'), 'utf8');

function customProperties(root: Root, selector: string): Map<string, string> {
  const values = new Map<string, string>();
  root.walkRules((rule) => {
    if (rule.selector !== selector) return;
    rule.walkDecls(/^--/, (declaration) => { values.set(declaration.prop, declaration.value); });
  });
  return values;
}

describe('AIOS visual language v2 tokens', () => {
  it('gives every themed --aios-* color a dark value', () => {
    const dark = customProperties(theme, DARK);
    const missing = [...customProperties(theme, LIGHT)]
      .filter(([name, value]) => name.startsWith('--aios-') && RAW_COLOR.test(value))
      .filter(([name]) => !THEME_INVARIANT.has(name) && !dark.has(name))
      .map(([name]) => name);
    expect(missing).toEqual([]);
    expect([...dark.keys()].filter((name) => THEME_INVARIANT.has(name))).toEqual([]);
  });

  it('bridges legacy names only to lobe or --aios-* variables, never raw colors', () => {
    // The bridge is every non --aios-* / --lobe-* name on the light root.
    const bridge = new Map([...customProperties(theme, LIGHT)].filter(([name]) => !/^--(aios|lobe)-/.test(name)));
    expect(bridge.size).toBeGreaterThan(0);
    const raw = [...bridge].filter(([, value]) => RAW_COLOR.test(value)).map(([name]) => name);
    expect(raw).toEqual([]);
  });

  it('references only --lobe-* variables that the pinned lobe-ui theme defines', () => {
    const referenced = new Set(theme.toString().match(/var\(--lobe-[a-z0-9-]+/g)?.map((ref) => ref.slice(4)));
    const undefinedRefs = [...referenced].filter((name) => !lobeTheme.includes(`${name}:`));
    expect(referenced.size).toBeGreaterThan(0);
    expect(undefinedRefs).toEqual([]);
  });

  it('references only --aios-* variables defined in the light block', () => {
    const light = customProperties(theme, LIGHT);
    const referenced = new Set(theme.toString().match(/var\(--aios-[a-z0-9-]+/g)?.map((ref) => ref.slice(4)));
    expect([...referenced].filter((name) => !light.has(name))).toEqual([]);
  });
});
