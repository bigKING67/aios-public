import { Link as RouterLink } from 'react-router-dom';
import { Badge } from '@/components/atoms/badge';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { StudioCapabilitiesResponse } from '../_lib/ai-studio-api';
import { SegmentSuggestWorkspace } from './segment-suggest-workspace';
import pageStyles from '../ai-studio.module.css';

/**
 * AI 分析 page body. When the suggestion capability is off it renders an
 * honest notice and mounts no trigger, so no model job can be requested.
 */
export function SegmentSuggestPanel({ capabilities }: { capabilities: StudioCapabilitiesResponse }) {
  const enabled = capabilities.segmentSuggestEnabled;
  return (
    <section className={pageStyles.panel} aria-labelledby="ai-studio-page-title">
      <header className={pageStyles.pageHeader}>
        <div>
          <h1 id="ai-studio-page-title">AI 分析</h1>
          <p>选原片，AI 结合画面和声音把原片切成片段并打上框架标签；人工确认后进入片段素材，供混剪使用。</p>
        </div>
        {enabled ? null : <Badge status="neutral">尚未启用</Badge>}
      </header>
      {enabled ? (
        <SegmentSuggestWorkspace capabilities={capabilities} />
      ) : (
        <article className={pageStyles.card}>
          <h2>AI 分析未启用</h2>
          <p>
            当前环境没有开启 AI 分析，本页不会发起任何模型调用。开启后只对你显式勾选的原片运行，不会自动分析全库；在此之前可以在片段素材页人工标注。
          </p>
          <div className={pageStyles.nextAction}>
            <RouterLink className={pageStyles.actionLink} to={ROUTE_PATHS.contentAiStudioAssets}>
              去原片人工标注
            </RouterLink>
          </div>
        </article>
      )}
    </section>
  );
}
