import { Drawer } from 'antd';
import sharedStyles from '../creator-library-shared.module.css';
import styles from './creator-library-detail-drawer.module.css';
import {
  formatDateText,
  formatFanCountWanText,
  formatOptionalText,
} from '../_lib/creator-library-formatters';
import {
  formatCreatorAnchorLevel,
  resolveCreatorAnchorLevelTone,
} from '../_lib/creator-library-levels';
import {
  formatCooperationStatusLabel,
  normalizePlatformLabel,
  resolveDisplayCooperationStatus,
} from '../_lib/creator-library-options';
import { resolveCreatorDisplayTags } from '../_lib/creator-library-tags';
import type { CreatorLibraryItem } from '../_lib/creator-library-types';

interface CreatorLibraryDetailDrawerProps {
  item: CreatorLibraryItem | null;
  open: boolean;
  onClose: () => void;
}

export function CreatorLibraryDetailDrawer({
  item,
  open,
  onClose,
}: CreatorLibraryDetailDrawerProps) {
  return (
    <Drawer
      title={item ? `达人详情：${item.influencerName}` : '达人详情'}
      size={620}
      open={open}
      onClose={onClose}
    >
      {item ? (
        <div className={styles.detailStack}>
          <section className={styles.detailHeader}>
            <div>
              <p>{normalizePlatformLabel(item.platform)}</p>
              <h2>{item.influencerName}</h2>
            </div>
            <div className={styles.detailHeaderTags}>
              <span className={`${sharedStyles.levelTag} ${resolveLevelClassName(item.anchorLevel)}`}>
                {formatCreatorAnchorLevel(item.anchorLevel)}
              </span>
            </div>
          </section>

          <dl className={styles.detailList}>
            <DetailRow label="达人ID" value={formatOptionalText(item.influencerId)} />
            <DetailRow label="主播标签" value={formatAnchorTags(item)} />
            <DetailRow
              label="粉丝数"
              value={formatFanCountWanText(item.mainPlatformFans, item.mainPlatformFansCount)}
            />
            <DetailRow
              label="合作状态"
              value={formatCooperationStatusLabel(resolveDisplayCooperationStatus(item))}
            />
            <DetailRow label="是否可合作" value={item.isCooperable ? '可合作' : '不可合作'} />
            <DetailRow label="归属BD" value={formatOptionalText(item.ownerName)} />
            <DetailRow label="最近跟进" value={formatDateText(item.lastFollowedAt)} />
            <DetailRow label="跟进历史" value={formatFollowLogCount(item.followLogCount)} />
            <DetailRow label="最近跟进记录" value={formatOptionalText(item.followNote)} />
            <DetailRow label="合作描述" value={formatOptionalText(item.cooperationDesc)} />
            <DetailRow label="来源" value={formatOptionalText(item.sourceType)} />
            <DetailRow label="创建者" value={formatOptionalText(item.createdBy)} />
            <DetailRow label="最近更新人" value={formatOptionalText(item.updatedBy)} />
            <DetailRow label="最近更新" value={formatOptionalText(item.updatedAt)} />
          </dl>
        </div>
      ) : null}
    </Drawer>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.detailRow}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatAnchorTags(item: CreatorLibraryItem): string {
  const tags = resolveCreatorDisplayTags(item);
  return tags.length ? tags.join('、') : formatOptionalText(item.anchorDesc);
}

function formatFollowLogCount(value?: number | null): string {
  const numericValue = value ?? 0;
  const count = Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
  return count > 0 ? `${count} 条记录` : '无记录';
}

function resolveLevelClassName(value?: string | null): string {
  const tone = resolveCreatorAnchorLevelTone(value);
  switch (tone) {
    case 's':
      return sharedStyles.levelToneS;
    case 'a':
      return sharedStyles.levelToneA;
    case 'b':
      return sharedStyles.levelToneB;
    case 'c':
      return sharedStyles.levelToneC;
    case 'd':
      return sharedStyles.levelToneD;
    default:
      return sharedStyles.levelToneUnknown;
  }
}
