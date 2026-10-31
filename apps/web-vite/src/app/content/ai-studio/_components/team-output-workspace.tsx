import { Alert, Button, Empty, Segmented, SkeletonText, Tooltip } from '@lobehub/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import { periodQuery, yesterdayDate, type PeriodSelection } from '../_lib/studio-period';
import {
  TEAM_OUTPUT_COLUMNS,
  TEAM_OUTPUT_DIMENSIONS,
  fetchTeamOutput,
  formatAmount,
  formatCount,
  formatRoi,
  isSentinelTeam,
  teamOutputErrorText,
  parseDimension,
  qualityParts,
  syncLine,
  teamOutputQueryKeys,
  type StudioTeamOutputMetrics,
  type StudioTeamOutputPerson,
  type StudioTeamOutputResponse,
  type StudioTeamOutputTeam,
  type TeamOutputDimension,
} from '../_lib/team-output';
import { StudioPeriodControl } from './studio-period-control';
import { TeamOutputExportButton } from './team-output-export-button';
import { PersonDrawer } from './team-output-person-drawer';
import styles from '../ai-studio.module.css';
import home from './studio-home.module.css';
import s from './team-output.module.css';

export const TEAM_OUTPUT_TITLE = '团队产出';
export const TEAM_OUTPUT_PURPOSE = '视频云管家里剪辑、编导的成片数量与巨量千川投放表现。';
const BASIS =
  '① 数据来源：视频云管家，每天早上同步前一天，最近 3 天会重读（云管家可能回补），今天的数据次日才完整；日期按北京时间。② 统计到谁：剪辑 = 成片作者；编导 = 成片上的「拍摄人/编导」标签，一条成片有几位编导，每位各计 1 条，小组和团队合计只算 1 次。团队和小组按这个人现在的组织统计（10 月 30 日之前的数据也按现在的组）。③ 金额：只统计巨量千川，为云管家原值；千川成交是直接成交（下单金额），不扣退款。新版巨量广告、百度、快手等其他平台的消耗不计入任何数字，只在提示行列出合计；只投了其他平台、当天没有抖音消耗的成片读不到，所以这个合计偏少。④ ROI = 千川成交 ÷ 千川消耗，成交为 0 的消耗也计入。⑤「新片」指这段时间上传的成片；千川消耗和有消耗成片包括以前上传、这段时间仍在投放的成片。';

/** Opens on the month holding yesterday: the newest complete day sits inside it. */
function defaultSelection(): PeriodSelection {
  return { unit: 'month', date: yesterdayDate() };
}

export function TeamOutputWorkspace() {
  const [selection, setSelection] = useState<PeriodSelection>(defaultSelection);
  const [params, setParams] = useSearchParams();
  const dimension = parseDimension(params.get('dimension'));
  const category = Number(params.get('category')) || undefined;
  const [person, setPerson] = useState<StudioTeamOutputPerson | null>(null);
  const query = {
    ...periodQuery(selection),
    dimension,
    oneLevelTypeId: category,
  };
  const result = useQuery({
    queryKey: teamOutputQueryKeys.summary(query),
    queryFn: ({ signal }) => fetchTeamOutput(query, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const data = result.data;
  const update = (next: { dimension?: TeamOutputDimension; category?: number }) => {
    const merged = { dimension, category, ...next };
    const search = new URLSearchParams();
    if (merged.dimension === 'director') search.set('dimension', 'director');
    if (merged.category) search.set('category', String(merged.category));
    setParams(search, { replace: true });
  };

  return (
    <section className={home.page} aria-labelledby="ai-studio-page-title" aria-busy={result.isFetching}>
      <header className={`${styles.pageHeader} ${home.header}`}>
        <div>
          <h1 id="ai-studio-page-title">{TEAM_OUTPUT_TITLE}</h1>
          <p>{TEAM_OUTPUT_PURPOSE}</p>
        </div>
        <div className={home.headerActions}>
          <StudioPeriodControl selection={selection} period={data?.period} onChange={setSelection} />
        </div>
      </header>

      <div className={s.toolbar}>
        <div role="group" aria-label="统计视角">
          <Segmented<TeamOutputDimension>
            value={dimension}
            options={TEAM_OUTPUT_DIMENSIONS.map((option) => ({ ...option }))}
            onChange={(value) => update({ dimension: value })}
          />
        </div>
        <LabeledSelect<number>
          label="品类"
          wrapperClassName={s.categorySelect}
          showSearch={(data?.categories.length ?? 0) >= 9}
          value={category ?? 0}
          options={[
            { value: 0, label: '全部品类' },
            ...(data?.categories ?? []).map((c) => ({
              value: c.id,
              label: c.name,
            })),
          ]}
          onChange={(value) =>
            update({
              category: typeof value === 'number' && value > 0 ? value : undefined,
            })
          }
        />
        <Tooltip title={BASIS}>
          <button type="button" className={home.infoButton} aria-label={`统计口径：${BASIS}`}>
            <Info size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>

      {result.isError ? (
        <Alert
          type="error"
          showIcon
          title="无法读取团队产出"
          description={teamOutputErrorText(result.error)}
          action={<Button onClick={() => void result.refetch()}>重试</Button>}
        />
      ) : null}

      {data ? <Notes data={data} dimension={dimension} /> : null}
      <Totals metrics={data?.totals} />

      {result.isPending ? (
        <SkeletonText rows={6} />
      ) : data && data.teams.length > 0 ? (
        <TeamTable data={data} query={query} onOpen={setPerson} />
      ) : data ? (
        <Empty
          className={s.empty}
          description={data.sync.latestCompleteDay ? '这段时间没有成片或消耗' : '团队数据还没有同步'}
        />
      ) : null}

      <PersonDrawer person={person} query={query} onClose={() => setPerson(null)} />
    </section>
  );
}

/** Freshness, the 抖音 source and the caveats that change how a number reads: one tertiary line each. */
function Notes({ data, dimension }: { data: StudioTeamOutputResponse; dimension: TeamOutputDimension }) {
  const sync = syncLine(data.sync);
  const caveats = qualityParts(data, dimension);
  return (
    <div className={s.notes}>
      <p className={s.note}>
        {sync.attention ? (
          <span className={`${home.dot} ${s.noteDot}`} data-signal="attention" aria-hidden="true" />
        ) : null}
        {sync.text} · 金额为巨量千川投放（云管家原值），成交不扣退款
      </p>
      {caveats.length > 0 ? <p className={s.note}>{caveats.join(' · ')}</p> : null}
    </div>
  );
}

const HEADLINE: readonly {
  label: string;
  value: (m: StudioTeamOutputMetrics) => string;
  caption?: (m: StudioTeamOutputMetrics) => string;
}[] = [
  {
    label: '成片数',
    value: (m) => formatCount(m.uploads),
    caption: (m) => `有消耗成片 ${formatCount(m.spentVideos)} 条（含以前上传）`,
  },
  {
    label: '千川消耗',
    value: (m) => formatAmount(m.spend),
    caption: (m) => `其中新片 ${formatAmount(m.newSpend)}`,
  },
  {
    label: '千川成交',
    value: (m) => formatAmount(m.gmv),
    caption: (m) => `其中新片 ${formatAmount(m.newGmv)}`,
  },
  {
    label: 'ROI',
    value: (m) => formatRoi(m.roi),
    caption: (m) => `新片 ROI ${formatRoi(m.newRoi)}`,
  },
];

/** The whole window, each 成片 once. */
function Totals({ metrics }: { metrics: StudioTeamOutputMetrics | undefined }) {
  return (
    <dl className={s.totals} aria-label="合计">
      {HEADLINE.map((item) => (
        <div key={item.label} className={s.total}>
          <dt className={home.flowLabel}>{item.label}</dt>
          <dd className={home.flowValue}>{metrics ? item.value(metrics) : '–'}</dd>
          <dd className={home.flowCaption}>{metrics && item.caption ? item.caption(metrics) : ' '}</dd>
        </div>
      ))}
    </dl>
  );
}

function MetricCells({ metrics }: { metrics: StudioTeamOutputMetrics }) {
  return (
    <>
      {TEAM_OUTPUT_COLUMNS.map((column) => (
        <td key={column.key} className={s.num}>
          {column.value(metrics)}
        </td>
      ))}
    </>
  );
}

/** Team → group → person. Teams fold; a person opens their 成片. */
function TeamTable({
  data,
  query,
  onOpen,
}: {
  data: StudioTeamOutputResponse;
  query: Parameters<typeof fetchTeamOutput>[0];
  onOpen: (person: StudioTeamOutputPerson) => void;
}) {
  // Teams start open and groups closed, so the first read is the team and group totals.
  const [foldedTeams, setFoldedTeams] = useState<ReadonlySet<string>>(new Set());
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set());
  const toggleIn = (set: typeof setFoldedTeams) => (key: string) =>
    set((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const groupKeys = data.teams
    .filter((team) => !isSentinelTeam(team))
    .flatMap((team) => team.groups.map((g) => groupKey(team, g)));
  const allOpen = groupKeys.length > 0 && groupKeys.every((key) => openGroups.has(key)) && foldedTeams.size === 0;
  return (
    <div className={s.tableWrap}>
      <div className={s.tableActions}>
        <TeamOutputExportButton query={query} />
        <Button
          type="text"
          size="small"
          onClick={() => {
            setFoldedTeams(new Set());
            setOpenGroups(allOpen ? new Set() : new Set(groupKeys));
          }}
        >
          {allOpen ? '全部收起' : '全部展开'}
        </Button>
      </div>
      <table className={s.table}>
        <thead>
          <tr>
            <th scope="col" className={s.nameHead}>
              团队 / 小组 / 人员
            </th>
            {TEAM_OUTPUT_COLUMNS.map((column) => (
              <th key={column.key} scope="col" className={s.num}>
                {column.hint ? (
                  <Tooltip title={column.hint}>
                    <span className={s.hinted}>{column.label}</span>
                  </Tooltip>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.teams.map((team) => (
            <TeamRows
              key={team.name}
              team={team}
              folded={foldedTeams.has(team.name)}
              onToggle={() => toggleIn(setFoldedTeams)(team.name)}
              openGroups={openGroups}
              onToggleGroup={toggleIn(setOpenGroups)}
              onOpen={onOpen}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function groupKey(team: StudioTeamOutputTeam, group: StudioTeamOutputTeam['groups'][number]): string {
  return `${team.name}/${group.name}`;
}

function TeamRows({
  team,
  folded,
  onToggle,
  openGroups,
  onToggleGroup,
  onOpen,
}: {
  team: StudioTeamOutputTeam;
  folded: boolean;
  onToggle: () => void;
  openGroups: ReadonlySet<string>;
  onToggleGroup: (key: string) => void;
  onOpen: (person: StudioTeamOutputPerson) => void;
}) {
  const sentinel = isSentinelTeam(team);
  return (
    <>
      <tr className={s.teamRow}>
        <th scope="row" className={s.name}>
          <button type="button" className={s.fold} aria-expanded={!folded} onClick={onToggle}>
            {folded ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
            <span data-muted={sentinel || undefined}>{team.name}</span>
          </button>
        </th>
        <MetricCells metrics={team.metrics} />
      </tr>
      {folded
        ? null
        : team.groups.map((group) => {
            // 未关联账号 / 未归属 have no real groups: their people stay listed under the team.
            const open = sentinel || openGroups.has(groupKey(team, group));
            return (
              <Fragment key={group.name}>
                {sentinel ? null : (
                  <tr className={s.groupRow}>
                    <th scope="row" className={s.name}>
                      <button
                        type="button"
                        className={`${s.fold} ${s.groupName}`}
                        aria-expanded={open}
                        onClick={() => onToggleGroup(groupKey(team, group))}
                      >
                        {open ? (
                          <ChevronDown size={14} aria-hidden="true" />
                        ) : (
                          <ChevronRight size={14} aria-hidden="true" />
                        )}
                        <span>{group.name}</span>
                        <span className={s.role}>{formatCount(group.people.length)} 人</span>
                      </button>
                    </th>
                    <MetricCells metrics={group.metrics} />
                  </tr>
                )}
                {(open ? group.people : []).map((person) => (
                  <tr key={person.key} className={s.personRow} data-sentinel={sentinel || undefined}>
                    <th scope="row" className={s.name}>
                      <button type="button" className={s.person} onClick={() => onOpen(person)}>
                        {person.name}
                      </button>
                      {person.roleName ? <span className={s.role}>{person.roleName}</span> : null}
                    </th>
                    <MetricCells metrics={person.metrics} />
                  </tr>
                ))}
              </Fragment>
            );
          })}
    </>
  );
}
