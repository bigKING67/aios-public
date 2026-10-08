import { Link as RouterLink } from 'react-router-dom';
import { Badge } from '@/components/atoms/badge';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { StudioCapabilitiesResponse } from '../_lib/ai-studio-api';
import { REMIX_PURPOSE } from '../_lib/remix-form';
import { EditingModeTabs } from './editing-mode-tabs';
import { FrameworkRemixForm } from './framework-remix-form';
import pageStyles from '../ai-studio.module.css';
import remixStyles from './remix.module.css';

/**
 * AI 剪辑 page in framework-remix mode (the mode switch sits in its header).
 * When the remix capability is off it renders an honest notice and mounts no
 * submit control, so no render can be queued.
 */
export function FrameworkRemixPanel({ capabilities }: { capabilities: StudioCapabilitiesResponse }) {
  const enabled = capabilities.remixEnabled;
  return (
    <section className={pageStyles.panel} aria-labelledby="ai-studio-page-title">
      <header className={pageStyles.pageHeader}>
        <div>
          <h1 id="ai-studio-page-title">AI 剪辑</h1>
          <p>{REMIX_PURPOSE}</p>
        </div>
        <div className={remixStyles.headerEnd}>
          {enabled ? null : <Badge status="neutral">尚未启用</Badge>}
          <EditingModeTabs remix />
        </div>
      </header>
      {enabled ? (
        <FrameworkRemixForm capabilities={capabilities} />
      ) : (
        <article className={pageStyles.card}>
          <h2>框架混剪未启用</h2>
          <p>当前环境没有开启框架混剪批量出片，本页不会创建任何渲染任务。开启后可在这里组合出片；在此之前可以先在片段素材页确认片段。</p>
          <div className={pageStyles.nextAction}>
            <RouterLink className={pageStyles.actionLink} to={ROUTE_PATHS.contentAiStudioSegments}>
              去片段素材
            </RouterLink>
          </div>
        </article>
      )}
    </section>
  );
}
