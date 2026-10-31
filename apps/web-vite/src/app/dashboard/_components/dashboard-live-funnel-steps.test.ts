import { describe, expect, it } from 'vitest';

import { buildLiveFunnelSteps } from './dashboard-live-funnel-steps';
import type { DashboardLiveDetailRow } from './dashboard-types';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((value) => (
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

describe('buildLiveFunnelSteps', () => {
  it('gives every stage a text color that stays readable on its fill', () => {
    const steps = buildLiveFunnelSteps({
      live_exposure_user_count: 1000,
      live_watch_user_count: 400,
      live_product_exposure_user: 200,
      live_product_click_user: 50,
      live_buyer_count: 10,
    } as unknown as DashboardLiveDetailRow);

    expect(steps).toHaveLength(5);
    for (const step of steps) {
      expect(contrast(step.textColor, step.color)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
