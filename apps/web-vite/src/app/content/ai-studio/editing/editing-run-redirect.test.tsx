import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import AiStudioEditingRunPage from './[runId]/page';

vi.mock('../_components/ai-studio-shell', () => ({
  AiStudioShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function renderRunLink(entry: string) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path={ROUTE_PATHS.contentAiStudioEditingRun} element={<AiStudioEditingRunPage />} />
        <Route path={ROUTE_PATHS.contentAiStudioEditing} element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="当前地址">{`${location.pathname}${location.search}`}</output>;
}

afterEach(cleanup);

describe('AI studio editing task link', () => {
  it('opens the task in the existing editing workspace selection', () => {
    renderRunLink(`${ROUTE_PATHS.contentAiStudioEditing}/run-1`);

    expect(screen.getByLabelText('当前地址')).toHaveTextContent(`${ROUTE_PATHS.contentAiStudioEditing}?editingRun=run-1`);
  });

  it('keeps other query parameters and lets the path decide the task', () => {
    renderRunLink(`${ROUTE_PATHS.contentAiStudioEditing}/run-2?view=frames&editingRun=stale`);

    expect(screen.getByLabelText('当前地址')).toHaveTextContent(
      `${ROUTE_PATHS.contentAiStudioEditing}?view=frames&editingRun=run-2`,
    );
  });
});
