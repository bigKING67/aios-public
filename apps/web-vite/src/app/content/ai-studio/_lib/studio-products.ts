import { CONTENT_ASSET_PRODUCT_OPTIONS } from '@/app/marketing/content-assets/_lib/content-assets-ui-helpers';

/**
 * Product choices inside the studio: the enterprise catalog
 * (`capabilities.products`), else the asset library's built-in list.
 */
export function studioProductOptions(products: readonly string[] | undefined): { label: string; value: string }[] {
  const names = products && products.length > 0 ? products : CONTENT_ASSET_PRODUCT_OPTIONS;
  return names.map((name) => ({ label: name, value: name }));
}

/**
 * A short list is read at a glance, so its dropdown opens straight onto the options; only a long
 * catalog gets the search field (a two-product enterprise should not see an empty input first).
 */
export function isLongOptionList(options: readonly unknown[]): boolean {
  return options.length >= 9;
}
