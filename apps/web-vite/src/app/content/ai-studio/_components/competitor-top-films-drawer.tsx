import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Button, Drawer, SkeletonText } from '@lobehub/ui';
import { ExternalLink, Video } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { useMediaQuery } from '@/hooks/use-media-query';
import { fetchCompetitorVideo } from '../_lib/competitor-api';
import type { TopFilm } from '../_lib/competitor-breakdown';
import { competitorAnalysisHref, formatSales, type PatternPayload } from '../_lib/competitor-patterns';
import { shortTitle } from '../_lib/competitor-report';
import { aiStudioQueryKeys } from '../_lib/ai-studio-api';
import styles from './competitor-breakdown.module.css';

/** What a row opened: its name, its count line and its TOP5 films. */
export interface TopFilmsTarget {
  title: string;
  figure: string;
  films: TopFilm[];
  /** Present for complete opening sources; absent preserves scene/endorser TOP5 behavior. */
  sourceCount?: number;
  unassigned?: boolean;
}

/**
 * The TOP5 films behind one 爆款拆解 row, by 关联直播间销售额 (one per material): cover, title, the
 * first 3 seconds, the 罗盘 band and links to the analysis and the Douyin film. The caveat that the
 * amount is the rooms' and not what a film sold stays at the top, as on the structure ranking.
 */
export function CompetitorTopFilmsDrawer({
  target,
  payload,
  salesAvailable,
  onClose,
}: {
  target: TopFilmsTarget | null;
  payload: PatternPayload;
  salesAvailable: boolean;
  onClose: () => void;
}) {
  const compact = useMediaQuery('(max-width: 640px)');
  return (
    <Drawer open={target !== null} title={target?.title} placement="right" width={compact ? '100%' : 560} onClose={onClose}>
      {target ? <TopFilms key={target.title} target={target} payload={payload} salesAvailable={salesAvailable} /> : null}
    </Drawer>
  );
}

function TopFilms({ target, payload, salesAvailable }: { target: TopFilmsTarget; payload: PatternPayload; salesAvailable: boolean }) {
  const [page, setPage] = useState(0);
  const allSources = target.sourceCount !== undefined;
  const visible = target.films.slice(page * 5, (page + 1) * 5);
  const videos = useQueries({
    queries: visible.map((film) => ({
      queryKey: [...aiStudioQueryKeys.root, 'competitor', 'video', film.awemeId],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchCompetitorVideo(film.awemeId, signal),
      staleTime: 5 * 60_000,
    })),
  });
  return (
    <div className={styles.drawerBody}>
      <p className={styles.rowDetail}>
        {target.figure}。
        {allSources
          ? `${target.unassigned ? '以下是尚未归类的开头文案' : '以下是归入本公式的来源文案'}，共 ${target.sourceCount} 条视频，保留每个视频。`
          : salesAvailable
            ? '按关联直播间销售额从高到低，同一素材只列一条。'
            : '罗盘榜单暂时读不到，没有金额；同一素材只列一条。'}
        {salesAvailable ? '金额是视频引流的直播间在这段时间的罗盘销售额，不是这条视频本身带来的成交。' : null}
      </p>
      {allSources && target.films.length !== target.sourceCount ? <p role="alert" className={styles.rowDetail}>来源明细不完整，请重新生成公式后核对。</p> : null}
      {target.films.length === 0 ? (
        <p className={styles.rowDetail}>这段时间没有可列出的视频。</p>
      ) : (
        <ol className={styles.films}>
          {visible.map((film, index) => {
            const video = videos[index]?.data;
            const known = payload.films[film.awemeId];
            const title = video?.title?.trim() || known?.title?.trim() || `抖音作品 ${film.awemeId}`;
            return (
              <li key={film.awemeId} className={styles.film}>
                <span className={styles.rank}>{page * 5 + index + 1}</span>
                <span className={styles.thumb} aria-hidden>
                  {video?.coverUrl ? <img src={video.coverUrl} alt="" loading="lazy" /> : <Video size={14} strokeWidth={1.6} />}
                </span>
                <div className={styles.filmBody}>
                  {videos[index]?.isPending && !known ? <SkeletonText rows={1} /> : null}
                  <span className={styles.filmTitle} title={title}>
                    {shortTitle(title)}
                  </span>
                  {film.opening ? (
                    <span className={styles.rowDetail}>
                      前 3 秒{film.openingKind === 'speech' ? '口播' : film.openingKind === 'onscreen_text' ? '画面文字' : '文案'}
                      {film.evidence?.length ? `（${film.evidence.map((e) => `${e.start}–${e.end} 秒`).join('、')}）` : ''}：{film.opening}
                    </span>
                  ) : <span className={styles.rowDetail}>开头文案暂缺</span>}
                  <span className={styles.filmLinks}>
                    {known?.analysisId ? (
                      <RouterLink className={styles.link} to={competitorAnalysisHref(known.analysisId)}>
                        查看拆解
                      </RouterLink>
                    ) : null}
                    {video?.shareUrl ? (
                      <a className={styles.link} href={video.shareUrl} target="_blank" rel="noreferrer noopener">
                        抖音原片 <ExternalLink size={14} strokeWidth={1.8} aria-hidden="true" />
                        <span className="sr-only">（新窗口打开）</span>
                      </a>
                    ) : null}
                  </span>
                </div>
                <span className={styles.sales}>
                  {film.salesMin === null ? '无金额' : formatSales({ min: film.salesMin, max: film.salesMax })}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {target.films.length > 5 ? (
        <div className={styles.pagination} aria-label="来源视频分页">
          <Button size="small" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</Button>
          <span className={styles.rowDetail}>第 {page * 5 + 1}–{Math.min((page + 1) * 5, target.films.length)} 条，共 {target.films.length} 条</span>
          <Button size="small" disabled={(page + 1) * 5 >= target.films.length} onClick={() => setPage(page + 1)}>下一页</Button>
        </div>
      ) : null}
    </div>
  );
}
