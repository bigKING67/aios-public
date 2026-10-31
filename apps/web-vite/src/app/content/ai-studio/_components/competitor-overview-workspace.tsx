import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, SkeletonText } from '@lobehub/ui';
import { Surface } from '@lobehub/ui/dashboard';
import { useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import {
  competitorOverviewQueryKeys,
  fetchCompetitorOverview,
  readOverview,
} from '../_lib/competitor-overview';
import {
  competitorPatternQueryKeys,
  fetchCompetitorPatterns,
  readPatternPayload,
  readStructureLaneParam,
  readStructureSort,
} from '../_lib/competitor-patterns';
import { CompetitorReportSection } from './competitor-report-section';
import { CompetitorStructureRanking } from './competitor-structure-ranking';
import { useCompetitorScope } from '../_lib/competitor-scope';
import { CompetitorScopeFilters } from './competitor-scope-filters';
import pageStyles from '../ai-studio.module.css';
import annotationStyles from './segment-annotation.module.css';

export const OVERVIEW_PAGE_TITLE = '爆款分析';
export const OVERVIEW_PAGE_PURPOSE =
  '同一品类的竞品爆款开头怎么说、在什么场景解决什么痛点、谁在背书、用什么框架；数字由程序按已拆解的视频统计，点任一行可看对应视频。';

const PENDING_POLL_MS = 5_000;

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '请求失败，请稍后重试。';
}

export function CompetitorOverviewWorkspace({ canWrite = false }: { canWrite?: boolean }) {
  const scope = useCompetitorScope();
  const { params, setParam, setSelection, category, selection, period } = scope;
  const patternsQuery = useQuery({
    queryKey: competitorPatternQueryKeys.patterns(category, period),
    queryFn: ({ signal }) => fetchCompetitorPatterns(category, period, { signal }),
    placeholderData: keepPreviousData,
    // A window without a snapshot is being computed by the worker (usually within a minute).
    refetchInterval: (query) => (query.state.data?.pending ? PENDING_POLL_MS : false),
    // Only while pending: a reader who switched tabs comes back to the finished statistics.
    refetchIntervalInBackground: true,
  });
  const overviewQuery = useQuery({
    queryKey: competitorOverviewQueryKeys.overview(category, period),
    queryFn: ({ signal }) => fetchCompetitorOverview(category, period, { signal }),
    placeholderData: keepPreviousData,
  });
  const snapshot = patternsQuery.data?.snapshot ?? null;
  const payload = useMemo(() => (snapshot ? readPatternPayload(snapshot.payload) : null), [snapshot]);
  // Our side waits for 视频云管家 spend (P2): the confirmed segments of test originals are not 我方 data.
  const own = null;
  const overview = useMemo(() => (overviewQuery.data ? readOverview(overviewQuery.data) : null), [overviewQuery.data]);
  const failed = patternsQuery.isError ? patternsQuery.error : overviewQuery.isError ? overviewQuery.error : null;

  return (
    <section
      className={pageStyles.panel}
      aria-labelledby="ai-studio-page-title"
      aria-busy={patternsQuery.isFetching || overviewQuery.isFetching}
    >
      <header className={pageStyles.pageHeader}>
        <div>
          <h1 id="ai-studio-page-title">{OVERVIEW_PAGE_TITLE}</h1>
          <p>{OVERVIEW_PAGE_PURPOSE}</p>
        </div>
      </header>

      <CompetitorScopeFilters
        category={category}
        selection={selection}
        period={patternsQuery.data?.window}
        categories={patternsQuery.data?.categories ?? []}
        labels={payload?.labels ?? null}
        onCategoryChange={(value) => setParam('category', value)}
        onSelectionChange={setSelection}
      />

      {patternsQuery.isPending || overviewQuery.isPending ? (
        <Surface>
          <SkeletonText rows={6} />
        </Surface>
      ) : failed ? (
        <Alert
          type="error"
          showIcon
          title="爆款分析读取失败"
          description={errorText(failed)}
          action={
            <Button
              onClick={() => {
                void patternsQuery.refetch();
                void overviewQuery.refetch();
              }}
            >
              重试
            </Button>
          }
        />
      ) : !overview || overview.current.analyzed === 0 ? (
        <div className={pageStyles.emptyState}>
          <p>
            这个范围内还没有拆解完成的竞品视频，添加并拆解后这里自动更新。
            {overview?.analyzing ? `（${overview.analyzing} 条正在拆解）` : null}
          </p>
          <RouterLink className={annotationStyles.secondaryLink} to={ROUTE_PATHS.contentAiStudioTrends}>
            去爆款视频添加
          </RouterLink>
        </div>
      ) : (
        <>
          {/* The conclusion before the evidence. */}
          <CompetitorReportSection
            category={category}
            period={period}
            canWrite={canWrite}
            payload={payload}
            // A previous window's placeholder must not cache the new window's
            // still-missing report under the snapshot it will later produce.
            inputSnapshot={patternsQuery.isPlaceholderData ? null : snapshot?.inputSnapshot ?? null}
          />
          {payload ? (
            <CompetitorStructureRanking
              payload={payload}
              own={own}
              computedAt={snapshot?.computedAt ?? null}
              analyzing={overview.analyzing}
              sort={readStructureSort(params.get('sort'))}
              lane={readStructureLaneParam(params.get('lane'))}
              onSortChange={(value) => setParam('sort', value)}
              onLaneChange={(value) => setParam('lane', value)}
            />
          ) : (
            <Surface>
              <Empty description="框架结构统计还在生成，通常一分钟内完成。" />
            </Surface>
          )}
        </>
      )}
    </section>
  );
}
