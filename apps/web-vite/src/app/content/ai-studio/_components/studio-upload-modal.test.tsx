import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeContentAssetUpload, createContentAssetUpload } from '@/app/marketing/content-assets/_lib/content-assets-api';
import { uploadFileToTos } from '@/app/marketing/content-assets/_lib/content-assets-upload';
import { StudioUploadModal } from './studio-upload-modal';

vi.mock('@/app/marketing/content-assets/_lib/content-assets-api', () => ({
  createContentAssetUpload: vi.fn(),
  completeContentAssetUpload: vi.fn(),
}));
vi.mock('@/app/marketing/content-assets/_lib/content-assets-upload', () => ({
  calculateFileSha256: vi.fn().mockResolvedValue('a'.repeat(64)),
  uploadFileToTos: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function renderModal(products: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StudioUploadModal open onClose={() => undefined} enterpriseTag="企业:百雀羚" products={products} />
    </QueryClientProvider>,
  );
}

function addFile(name: string) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['video'], name, { type: 'video/mp4' })] } });
}

describe('studio original upload', () => {
  it('uploads with the fixed enterprise tag and the chosen product', async () => {
    vi.mocked(createContentAssetUpload).mockResolvedValue({
      assetId: 'asset-1', bucket: 'b', objectKey: 'raw/a.mp4', uploadUrl: 'https://tos.invalid', method: 'PUT', expiresAt: '', headers: {},
    });
    vi.mocked(completeContentAssetUpload).mockResolvedValue({} as never);
    renderModal(['【测试】百雀羚样片']);
    expect(screen.getByText('企业：百雀羚')).toBeInTheDocument();
    addFile('整片-006 新品种草.mp4');
    expect(await screen.findByDisplayValue('整片-006 新品种草')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /上传 1 个文件/ }));
    await waitFor(() => expect(completeContentAssetUpload).toHaveBeenCalledWith('asset-1', { fileSizeBytes: 5, rawSha256: 'a'.repeat(64) }));
    expect(createContentAssetUpload).toHaveBeenCalledWith(expect.objectContaining({
      title: '整片-006 新品种草',
      productName: '【测试】百雀羚样片',
      productNames: ['【测试】百雀羚样片'],
      tags: ['企业:百雀羚'],
    }));
    expect(uploadFileToTos).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('1 个原片已上传')).toBeInTheDocument();
  });

  it('requires a product before uploading', async () => {
    renderModal(['产品甲', '产品乙']);
    addFile('a.mp4');
    const start = await screen.findByRole('button', { name: /上传 1 个文件/ });
    expect(start).toBeDisabled();
  });
});
