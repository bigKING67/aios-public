import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { createEmptyContentAssetSummary } from './_lib/content-assets-ui-helpers';
import { ContentAssetsModuleNav } from './_components/content-assets-module-nav';
import { CONTENT_ASSETS_NAV_OPTIONS } from './_components/content-assets-module-nav-config';
import ContentAssetsPage from './page';

vi.mock('./_components/content-assets-client', () => ({
  ContentAssetsClient: () => <p>素材库工作台</p>,
}));

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="当前地址">{`${location.pathname}${location.search}`}</output>;
}

function renderLibrary(entry: string) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path={ROUTE_PATHS.marketingContentAssets} element={<ContentAssetsPage />} />
        <Route path={ROUTE_PATHS.contentAiStudioEditing} element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('AI editing migration out of the content library', () => {
  it('sends saved library editing links to the AI studio task', () => {
    renderLibrary(`${ROUTE_PATHS.marketingContentAssets}?editingRun=run%2F1`);

    expect(screen.getByLabelText('当前地址')).toHaveTextContent(`${ROUTE_PATHS.contentAiStudioEditing}?editingRun=run%2F1`);
  });

  it('keeps every other query parameter of the saved link', () => {
    renderLibrary(`${ROUTE_PATHS.marketingContentAssets}?tab=result&editingRun=run-1&view=frames`);

    expect(screen.getByLabelText('当前地址')).toHaveTextContent(
      `${ROUTE_PATHS.contentAiStudioEditing}?tab=result&editingRun=run-1&view=frames`,
    );
  });

  it('keeps the ordinary library entry in place', () => {
    renderLibrary(ROUTE_PATHS.marketingContentAssets);

    expect(screen.getByText('素材库工作台')).toBeInTheDocument();
  });

  it('turns the library AI 剪辑 module into a jump to the studio', () => {
    const onModuleChange = vi.fn();
    render(
      <MemoryRouter initialEntries={[ROUTE_PATHS.marketingContentAssets]}>
        <Routes>
          <Route
            path={ROUTE_PATHS.marketingContentAssets}
            element={<ContentAssetsModuleNav activeModule="home" onModuleChange={onModuleChange} summary={createEmptyContentAssetSummary()} />}
          />
          <Route path={ROUTE_PATHS.contentAiStudioEditing} element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    const jump = screen.getByRole('button', { name: 'AI 剪辑' });
    expect(jump).not.toHaveAttribute('aria-pressed');
    fireEvent.click(jump);

    expect(onModuleChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('当前地址')).toHaveTextContent(ROUTE_PATHS.contentAiStudioEditing);
    expect(CONTENT_ASSETS_NAV_OPTIONS.map((option) => option.label)).not.toContain('AI 剪辑');
  });
});
