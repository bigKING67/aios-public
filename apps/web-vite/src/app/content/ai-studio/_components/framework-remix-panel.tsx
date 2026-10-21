import { Link as RouterLink } from 'react-router-dom';
import { Badge } from '@/components/atoms/badge';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { StudioCapabilitiesResponse } from '../_lib/ai-studio-api';
import { type RemixFormMode, remixModeLabel } from '../_lib/remix-api';
import { remixPurpose } from '../_lib/remix-form';
import { EditingModeTabs } from './editing-mode-tabs';
import { FrameworkRemixForm } from './framework-remix-form';
import pageStyles from '../ai-studio.module.css';
import remixStyles from './remix.module.css';

/**
 * AI 剪辑 page in a remix mode (框架混剪 or 卖点混剪; the mode switch sits in
 * its header). When the remix capability is off it renders an honest notice
 * and mounts no submit control, so no render can be queued.
 */
export function FrameworkRemixPanel({
  capabilities,
  mode = 'framework',
}: {
  capabilities: StudioCapabilitiesResponse;
  mode?: RemixFormMode;
}) {
  const enabled = capabilities.remixEnabled;
  const name = remixModeLabel(mode);
  return (
    <section className={pageStyles.panel} aria-labelledby="ai-studio-page-title">
      <header className={pageStyles.pageHeader}>
        <div>
          <h1 id="ai-studio-page-title">AI 剪辑</h1>
          <p>{remixPurpose(mode)}</p>
        </div>
        <div className={remixStyles.headerEnd}>
          {enabled ? null : <Badge status="neutral">尚未启用</Badge>}
          <EditingModeTabs mode={mode} />
        </div>
      </header>
      {enabled ? (
        // Remount per mode so a structure picked for one mode never leaks into the other.
        <FrameworkRemixForm key={mode} capabilities={capabilities} mode={mode} />
      ) : (
        <article className={pageStyles.card}>
          <h2>{name}未启用</h2>
          <p>当前环境没有开启混剪批量出片，本页不会创建任何渲染任务。开启后可在这里组合出片；在此之前可以先在框架片段页确认片段。</p>
          <div className={pageStyles.nextAction}>
            <RouterLink className={pageStyles.actionLink} to={ROUTE_PATHS.contentAiStudioSegments}>
              去框架片段
            </RouterLink>
          </div>
        </article>
      )}
    </section>
  );
}
