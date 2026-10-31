import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LobeProvider } from '@/components/lobe-provider';
import type { ContentAssetDetailResponse } from '../_lib/content-assets-types';
import { ContentAssetIdentityModal } from './content-assets-identity-modal';

afterEach(cleanup);

const detail = {
  asset: { assetId: 'asset-1', title: '控油洗发水-达人口播', platformNames: [], creatorName: null },
  platformVideos: [],
  adMaterials: [],
  shortVideoProfileHint: null,
} as unknown as ContentAssetDetailResponse;

function renderModal(mode: 'platform-video' | 'ad-material') {
  const onSubmitPlatformVideo = vi.fn();
  const onSubmitAdMaterial = vi.fn();
  render(
    <ContentAssetIdentityModal
      open
      mode={mode}
      detail={detail}
      onCancel={vi.fn()}
      onSubmitPlatformVideo={onSubmitPlatformVideo}
      onSubmitAdMaterial={onSubmitAdMaterial}
    />,
    { wrapper: LobeProvider },
  );
  return { onSubmitPlatformVideo, onSubmitAdMaterial };
}

describe('identity modal form', () => {
  it('keeps the required 千川素材ID rule and message, then submits the typed id', async () => {
    const { onSubmitAdMaterial } = renderModal('ad-material');

    await userEvent.click(await screen.findByRole('button', { name: '保存素材实例' }));
    expect(await screen.findByText('请输入千川素材ID')).toHaveAttribute('role', 'alert');
    expect(onSubmitAdMaterial).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('千川素材ID'), '1788');
    expect(screen.queryByText('请输入千川素材ID')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '保存素材实例' }));

    await waitFor(() =>
      expect(onSubmitAdMaterial).toHaveBeenCalledWith(expect.objectContaining({ adPlatform: 'qianchuan', externalMaterialId: '1788' })),
    );
  });

  it('requires a platform for a platform identity', async () => {
    const { onSubmitPlatformVideo } = renderModal('platform-video');

    await userEvent.click(await screen.findByRole('button', { name: '保存平台身份' }));
    expect(await screen.findByText('请输入平台')).toHaveAttribute('role', 'alert');
    expect(onSubmitPlatformVideo).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: /平台/ })).toBeInTheDocument();
  });
});
