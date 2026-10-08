import { InfoCircleOutlined } from '@ant-design/icons';
import { Alert, Button, Checkbox, Popconfirm, Tooltip } from 'antd';
import { Link as RouterLink } from 'react-router-dom';
import type { StudioRemixEditCheckResponse, StudioRemixEditMatch } from '../_lib/remix-api';
import { REMIX_EDIT_DUPLICATE_CODE } from '../_lib/remix-edit';
import { buildRemixBatchPath } from '../_lib/remix-routes';
import { readStudioConflict } from '../_lib/segment-errors';
import { formatSegmentDuration } from '../_lib/segment-time';
import { formatShortTimestamp } from '../_lib/studio-time';
import pageStyles from '../ai-studio.module.css';
import styles from './segment-annotation.module.css';
import editStyles from './single-edit.module.css';
import workbenchStyles from './studio-workbench.module.css';

const EDIT_RULES =
  '按剪辑台的顺序和入出点拼接，不调用模型、不加字幕，保留各片段原声；一条成片只用同一产品的已确认片段，修剪不能超出片段范围。';

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '请求失败，请稍后重试。';
}

function MatchList({ matches, showOverlap }: { matches: readonly StudioRemixEditMatch[]; showOverlap: boolean }) {
  return (
    <ul className={editStyles.matches}>
      {matches.map((match) => (
        <li key={`${match.batchId}-${match.ordinal}`}>
          <RouterLink className={styles.tableLink} to={buildRemixBatchPath(match.batchId)}>
            {match.mode === 'edit' ? '单条剪辑' : `框架混剪 · 第 ${match.ordinal} 条`} · {match.batchId.slice(0, 8)}
          </RouterLink>
          <span>
            {showOverlap ? `重叠 ${Math.round(match.overlap * 100)}% · ` : ''}
            {formatSegmentDuration(0, match.durationMs)} · {match.outcome === 'running' ? '出片中' : '已完成'} ·{' '}
            {formatShortTimestamp(match.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface EditLaunchCardProps {
  presetVersion: number;
  productName: string | null;
  clipCount: number;
  totalMs: number;
  maxSeconds: number;
  canWrite: boolean;
  blocker: string | null;
  check: { data: StudioRemixEditCheckResponse | undefined; pending: boolean; error: unknown };
  allowDuplicate: boolean;
  onAllowDuplicate: (value: boolean) => void;
  creating: boolean;
  createError: unknown;
  onCreate: () => void;
}

/** Totals, the duplicate/similar check and the one-output generate action. */
export function EditLaunchCard(props: EditLaunchCardProps) {
  const { check, blocker } = props;
  const exact = check.data?.exact ?? [];
  const similar = check.data?.similar ?? [];
  const checked = !blocker && !check.pending && !check.error && Boolean(check.data);
  const canSubmit = props.canWrite && checked && (exact.length === 0 || props.allowDuplicate) && !props.creating;
  const status = !props.canWrite
    ? '没有素材编辑权限，不能生成。'
    : blocker ?? (check.pending ? '正在检查是否已有相同成片…' : check.error ? null : exact.length === 0 && similar.length === 0 ? '没有重复或相似的成片。' : null);
  const duplicateRejected = readStudioConflict(props.createError)?.code === REMIX_EDIT_DUPLICATE_CODE;
  const overLimit = props.totalMs > props.maxSeconds * 1000;

  return (
    <article className={`${pageStyles.card} ${workbenchStyles.launch}`} aria-labelledby="edit-launch-title">
      <div className={workbenchStyles.launchHead}>
        <h2 id="edit-launch-title">生成成片</h2>
        <span className={workbenchStyles.launchMeta}>
          框架标签 v{props.presetVersion}
          <Tooltip title={EDIT_RULES} trigger={['hover', 'focus']}>
            <InfoCircleOutlined className={workbenchStyles.infoIcon} tabIndex={0} aria-label="单条剪辑规则" />
          </Tooltip>
        </span>
      </div>
      <dl className={editStyles.stats}>
        <div className={editStyles.statProduct}>
          <dt>产品</dt>
          <dd title={props.productName ?? undefined}>{props.productName ?? '—'}</dd>
        </div>
        <div>
          <dt>段数</dt>
          <dd>{props.clipCount}</dd>
        </div>
        <div>
          <dt>总时长</dt>
          <dd className={overLimit ? editStyles.overLimit : undefined}>
            {(props.totalMs / 1000).toFixed(1)} / {props.maxSeconds} 秒
          </dd>
        </div>
      </dl>
      {check.error && !blocker ? <Alert type="error" showIcon title="查重失败" description={errorText(check.error)} /> : null}
      {exact.length > 0 && !blocker ? (
        <Alert
          type="warning"
          showIcon
          title="已有完全相同的成片"
          description={
            <div className={editStyles.matchBody}>
              <MatchList matches={exact} showOverlap={false} />
              <Checkbox checked={props.allowDuplicate} onChange={(event) => props.onAllowDuplicate(event.target.checked)}>
                仍然生成
              </Checkbox>
            </div>
          }
        />
      ) : null}
      {similar.length > 0 && !blocker ? (
        <Alert
          type="info"
          showIcon
          title={`有 ${similar.length} 条相似成片`}
          description={
            <div className={editStyles.matchBody}>
              <MatchList matches={similar} showOverlap />
              <span>共用的原片时长超过 80%，可以生成，确认确实需要这一版。</span>
            </div>
          }
        />
      ) : null}
      <div className={workbenchStyles.launchFoot}>
        <Popconfirm
          title="确认生成这条成片？"
          description="成片进入渲染队列，通常 1–3 分钟完成。提交后不会自动重试，可在「成片」查看进度。"
          okText="开始生成"
          cancelText="取消"
          onConfirm={props.onCreate}
          disabled={!canSubmit}
        >
          <Button type={canSubmit ? 'primary' : 'default'} block disabled={!canSubmit} loading={props.creating}>
            生成这条成片
          </Button>
        </Popconfirm>
        <p className={workbenchStyles.estimate}>
          {status ?? `1080×1920 · 30fps · 最长 ${props.maxSeconds} 秒，统一响度 -14 LUFS；非 9:16 原片会有黑边。`}
        </p>
      </div>
      {props.createError ? (
        <Alert
          type="error"
          showIcon
          title={duplicateRejected ? '已有完全相同的成片' : '提交失败'}
          description={duplicateRejected ? '刚刚有人生成了同样的成片。确认仍要生成请勾选「仍然生成」。' : errorText(props.createError)}
        />
      ) : null}
    </article>
  );
}
