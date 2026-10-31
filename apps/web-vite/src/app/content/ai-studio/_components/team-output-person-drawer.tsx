import { Alert, Button, Drawer, Empty, Segmented, SkeletonText, Tooltip } from '@lobehub/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  fetchTeamOutput,
  fetchTeamOutputVideos,
  formatAmount,
  formatCount,
  formatRoi,
  teamOutputErrorText,
  teamOutputQueryKeys,
  type StudioTeamOutputPerson,
} from '../_lib/team-output';
import { TeamOutputExportButton } from './team-output-export-button';
import s from './team-output.module.css';

/**
 * One person's 成片 in the window: those uploaded in it (the table's 成片数) and older ones that spent in
 * it, which share the window's spend. Exact 千川 amounts, ROI and the cumulative spend, 50 a page.
 */
const PAGE_SIZE = 50;

type VideoScope = 'all' | 'new' | 'previous';

export function PersonDrawer({
  person,
  query,
  onClose,
}: {
  person: StudioTeamOutputPerson | null;
  query: Parameters<typeof fetchTeamOutput>[0];
  onClose: () => void;
}) {
  const compact = useMediaQuery('(max-width: 640px)');
  return (
    <Drawer
      open={person !== null}
      title={person?.name}
      placement="right"
      width={compact ? '100%' : 720}
      onClose={onClose}
    >
      {person ? <PersonVideos key={person.key} person={person} query={query} /> : null}
    </Drawer>
  );
}

function PersonVideos({
  person,
  query,
}: {
  person: StudioTeamOutputPerson;
  query: Parameters<typeof fetchTeamOutput>[0];
}) {
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState<VideoScope>('all');
  const videosQuery = {
    ...query,
    personKey: person.key,
    scope,
    page,
    pageSize: PAGE_SIZE,
  };
  const result = useQuery({
    queryKey: teamOutputQueryKeys.videos(videosQuery),
    queryFn: ({ signal }) => fetchTeamOutputVideos(videosQuery, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const m = person.metrics;
  const pages = result.data ? Math.max(1, Math.ceil(result.data.total / PAGE_SIZE)) : 1;
  // Uploaded in the window = the table's 成片数; the rest are older films that spent in it.
  const newTotal = result.data?.newTotal ?? m.uploads;
  const previousTotal = result.data?.previousTotal;
  return (
    <div className={s.drawerBody}>
      <p className={s.note}>
        本期上传 {formatCount(newTotal)} 条
        {previousTotal === undefined ? '' : ` · 以前上传、本期有消耗 ${formatCount(previousTotal)} 条`} · 千川消耗{' '}
        {formatAmount(m.spend, true)} · 千川成交 {formatAmount(m.gmv, true)} · ROI {formatRoi(m.roi)}
      </p>
      <div className={s.drawerActions}>
        <div role="group" aria-label="成片范围">
          <Segmented<VideoScope>
            size="small"
            value={scope}
            options={[
              { value: 'all', label: '全部' },
              { value: 'new', label: '本期上传' },
              { value: 'previous', label: '以前上传' },
            ]}
            onChange={(value) => {
              setScope(value);
              setPage(1);
            }}
          />
        </div>
        <TeamOutputExportButton query={query} personKey={person.key} />
      </div>
      {result.isError ? (
        <Alert type="error" showIcon title="无法读取成片明细" description={teamOutputErrorText(result.error)} />
      ) : result.isPending ? (
        <SkeletonText rows={6} />
      ) : result.data.items.length === 0 ? (
        <Empty
          className={s.empty}
          description={
            scope === 'previous'
              ? '这段时间没有以前上传的成片产生消耗'
              : scope === 'new'
                ? '这段时间没有上传成片'
                : '这段时间没有成片或消耗'
          }
        />
      ) : (
        <>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th scope="col" className={s.nameHead}>
                    成片
                  </th>
                  <th scope="col" className={s.num}>
                    千川消耗
                  </th>
                  <th scope="col" className={s.num}>
                    千川成交
                  </th>
                  <th scope="col" className={s.num}>
                    ROI
                  </th>
                  <th scope="col" className={s.num}>
                    <Tooltip title="这条成片在云管家的累计消耗（各平台合计、不限所选日期），是同步时的快照，和左侧按日期统计的千川消耗口径不同，只供参考；没有读到时显示 —">
                      <span className={s.hinted}>累计消耗</span>
                    </Tooltip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.data.items.map((video) => (
                  <tr key={video.videoId} className={s.personRow}>
                    <th scope="row" className={s.videoCell}>
                      <div className={s.videoCellBody}>
                        <span className={s.videoName}>{video.name}</span>
                        <span className={s.role}>
                          {[
                            video.uploadedAt.slice(0, 10),
                            video.isNew ? null : '以前上传',
                            video.oneLevelTypeName,
                            video.videoStateName,
                            video.directorNames.length > 0 ? `编导 ${video.directorNames.join('、')}` : null,
                            video.authorName ? `剪辑 ${video.authorName}` : null,
                            `ID ${video.videoId}`,
                            video.otherPlatformSpend > 0
                              ? `其他平台 ${formatAmount(video.otherPlatformSpend, true)} 未计入`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                    </th>
                    <td className={s.num}>{formatAmount(video.spend, true)}</td>
                    <td className={s.num}>{formatAmount(video.gmv, true)}</td>
                    <td className={s.num}>{formatRoi(video.roi)}</td>
                    <td className={s.num}>
                      {video.totalStatCost == null ? '—' : formatAmount(video.totalStatCost, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 ? (
            <div className={s.pager}>
              <Button size="small" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                上一页
              </Button>
              <span className={s.role}>
                第 {page} / {pages} 页 · 共 {formatCount(result.data.total)} 条
              </span>
              <Button size="small" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                下一页
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
