import { CONTENT_ASSET_PRODUCT_OPTIONS } from '@/app/marketing/content-assets/_lib/content-assets-ui-helpers';

/**
 * Product choices inside the studio: the enterprise catalog
 * (`capabilities.products`), else the asset library's built-in list.
 */
export function studioProductOptions(products: readonly string[] | undefined): { label: string; value: string }[] {
  const names = products && products.length > 0 ? products : CONTENT_ASSET_PRODUCT_OPTIONS;
  return names.map((name) => ({ label: name, value: name }));
}
