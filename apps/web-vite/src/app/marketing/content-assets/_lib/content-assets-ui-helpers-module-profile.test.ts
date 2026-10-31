import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/frontend-env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/frontend-env')>();
  return { ...actual, frontendEnv: { ...actual.frontendEnv, moduleProfile: 'ai_studio' } };
});

const {
  normalizeContentAssetProductName,
  resolveContentAssetProductOptions,
  resolveContentAssetProductSceneFamily,
} = await import('./content-assets-ui-helpers');

describe('content asset products under VITE_AIOS_MODULE_PROFILE=ai_studio', () => {
  it('offers the enterprise catalog from filter options instead of the groland list', () => {
    const options = resolveContentAssetProductOptions(['百雀羚蜜粉', ' 百雀羚蜜粉 ', '', '【测试】百雀羚样片']);
    expect(options.map((option) => option.value)).toEqual(['百雀羚蜜粉', '【测试】百雀羚样片']);
    expect(resolveContentAssetProductOptions(null)).toEqual([]);
  });

  it('keeps catalog names verbatim and leaves membership to the backend', () => {
    expect(normalizeContentAssetProductName(' 百雀羚蜜粉 ')).toBe('百雀羚蜜粉');
    expect(normalizeContentAssetProductName('小绿瓶')).toBe('小绿瓶');
    expect(normalizeContentAssetProductName('  ')).toBeNull();
  });

  it('has no groland scene family for catalog products', () => {
    expect(resolveContentAssetProductSceneFamily(['百雀羚蜜粉'])).toBeNull();
  });
});
