'use client';

import { Alert, Button, Empty, Skeleton } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { resolveClientErrorMessage } from '@/lib/client-error';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { fetchLiveCenterSessionDetail } from '../_lib/live-center-api';
import { liveCenterQueryKeys } from '../_lib/live-center-query-keys';
import { resolveAnalysisDisplayId } from '../_lib/live-center-view-helpers';
import resultStyles from '../live-center-analysis-result.module.css';
import styles from '../live-center.module.css';
import { AnalysisResultCard } from './live-center-analysis-result-card';

export function LiveCenterAnalysisResultClient({
  analysisId,
  sessionId,
}: {
  analysisId: string;
  sessionId: string;
}) {
  const detailQuery = useQuery({
    queryKey: liveCenterQueryKeys.detail(sessionId),
    queryFn: ({ signal }) => fetchLiveCenterSessionDetail(sessionId, { signal }),
    enabled: sessionId.length > 0,
    refetchOnMount: 'always',
    staleTime: 0,
  });
  const detail = detailQuery.data ?? null;
  const analysis = detail?.analyses.find((item) => resolveAnalysisDisplayId(item) === analysisId) ?? null;
  const session = detail?.session ?? null;
  const isUnavailable = Boolean(detailQuery.error && !detail);

  return (
    <ProtectedRoute>
      <Layout variant="immersive">
        <main className={resultStyles.analysisResultShell}>
          <section className={resultStyles.analysisResultConsole}>
            <header className={resultStyles.analysisResultTopbar}>
              <Link className={resultStyles.analysisResultBackLink} to={ROUTE_PATHS.contentLiveCenter}>
                <ArrowLeftOutlined />
                返回直播中台
              </Link>
              <div className={resultStyles.analysisResultTitleBlock}>
                <span>AI 分析结果</span>
                <h1>{session?.anchorNickname || '直播场次分析'}</h1>
              </div>
              <Button
                loading={detailQuery.isFetching}
                onClick={() => detailQuery.refetch()}
              >
                刷新结果
              </Button>
            </header>

            {detailQuery.isLoading && !detail ? (
              <section className={styles.panel}>
                <Skeleton active paragraph={{ rows: 8 }} title />
              </section>
            ) : null}

            {isUnavailable ? (
              <Alert
                className={styles.inlineAlert}
                type="error"
                showIcon
                message="AI 分析结果加载失败"
                description={resolveClientErrorMessage(detailQuery.error, '请稍后重试或返回直播中台重新打开。')}
                action={(
                  <Button size="small" onClick={() => detailQuery.refetch()}>
                    重试
                  </Button>
                )}
              />
            ) : null}

            {!detailQuery.isLoading && detail && !analysis ? (
              <section className={styles.panel}>
                <Empty
                  className={styles.emptyBlock}
                  description={`未找到分析 ID：${analysisId}`}
                />
              </section>
            ) : null}

            {analysis ? (
              <AnalysisResultCard analysis={analysis} recording={detail?.recording ?? null} session={session} />
            ) : null}
          </section>
        </main>
      </Layout>
    </ProtectedRoute>
  );
}
