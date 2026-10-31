// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { douyinEmbedUrl } from '../_lib/competitor-api';
import { CompetitorOriginalPlayer } from './competitor-original-player';

afterEach(cleanup);

describe('CompetitorOriginalPlayer', () => {
  it('builds the official embed URL only for numeric aweme ids', () => {
    expect(douyinEmbedUrl('7696817715536874793')).toBe(
      'https://open.douyin.com/player/video?vid=7696817715536874793&autoplay=0',
    );
    expect(douyinEmbedUrl('76968&x=1')).toBeNull();
    expect(douyinEmbedUrl('')).toBeNull();
  });

  it('shows the player in place, lazily loaded', () => {
    render(<CompetitorOriginalPlayer awemeId="7696817715536874793" />);
    const player = screen.getByTitle('抖音原片播放器');
    expect(player.getAttribute('src')).toBe(douyinEmbedUrl('7696817715536874793'));
    expect(player.getAttribute('loading')).toBe('lazy');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing for an invalid id', () => {
    render(<CompetitorOriginalPlayer awemeId="not-an-id" />);
    expect(screen.queryByTitle('抖音原片播放器')).toBeNull();
  });
});
