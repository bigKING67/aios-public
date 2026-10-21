import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiStudioAssetsView } from './ai-studio-assets-view';

vi.mock('@/app/marketing/content-assets/_lib/content-assets-api', () => ({
  fetchContentAssets: vi.fn(async () => ({ items: [{ assetId: 'source-1', title: '验收原片', tags: [], productNames: ['蜜粉'] }], total: 1, filterOptions: { videoTypes: [] } })),
}));
vi.mock('./use-asset-annotation-summaries', () => ({
  useAssetAnnotationSummaries: () => ({ summaries: new Map(), query: {} }),
}));
vi.mock('./studio-upload-modal', () => ({ StudioUploadModal: () => null }));
vi.mock('@/app/marketing/content-assets/_components/content-assets-asset-list', () => ({
  ContentAssetsSkeleton: () => null,
  ContentAssetsGrid: ({ items, onOpen }: { items: { assetId: string }[]; onOpen: (asset: { assetId: string }) => void }) => (
    <button onClick={() => onOpen(items[0])}>打开原片卡片</button>
  ),
}));
afterEach(cleanup);
function Location() { const location = useLocation(); return <output aria-label="当前地址">{location.pathname + location.search}</output>; }
function open(query = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/content/ai-studio/assets' + query]}><AiStudioAssetsView /><Location /></MemoryRouter></QueryClientProvider>);
}
describe('source picker annotation context', () => {
  it('keeps selling-point context when opening a source card', async () => {
    open('?presetKey=selling_point');
    fireEvent.click(await screen.findByText('打开原片卡片'));
    expect(screen.getByLabelText('当前地址')).toHaveTextContent('/content/ai-studio/selling-points?assetId=source-1&presetKey=selling_point');
  });
  it('keeps selling-point context in the table action', async () => {
    open('?presetKey=selling_point&view=table');
    expect(await screen.findByRole('link', { name: '标注片段' })).toHaveAttribute('href', '/content/ai-studio/selling-points?assetId=source-1&presetKey=selling_point');
  });
  it.each(['', '?presetKey=unknown'])('keeps the default framework destination for %s', async (query) => {
    open(query);
    fireEvent.click(await screen.findByText('打开原片卡片'));
    expect(screen.getByLabelText('当前地址')).toHaveTextContent('/content/ai-studio/segments?assetId=source-1');
  });
});
