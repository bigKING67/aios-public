import { Info } from 'lucide-react';
import { Alert, Button, Input, TextArea, Tooltip } from '@lobehub/ui';
import { AiActionButton } from '@/components/molecules/ai-action-button';
import { useState } from 'react';
import { collectionNotice, ESTIMATED_CNY_PER_VIDEO, isAnalysisActive, type StudioCompetitorVideo } from '../_lib/competitor-api';
import pageStyles from '../ai-studio.module.css';
import styles from './segment-annotation.module.css';
import competitorStyles from './competitor.module.css';
import workbenchStyles from './studio-workbench.module.css';
function errorText(error: unknown) { return error instanceof Error ? error.message : '请求失败，请稍后重试。'; }
interface CompetitorAddCardProps {
  canWrite: boolean;
  pending: boolean;
  onOpen: (video: StudioCompetitorVideo) => void;
  onSubmit: (
    request: { shareUrl: string; brandName?: string; productCategory?: string; notes?: string },
    analyzeNow: boolean,
  ) => Promise<StudioCompetitorVideo>;
}

export function CompetitorAddCard({ canWrite, pending, onSubmit, onOpen }: CompetitorAddCardProps) {
  const [shareUrl, setShareUrl] = useState('');
  const [brandName, setBrandName] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [collected, setCollected] = useState<StudioCompetitorVideo | null>(null);

  const submit = async (analyzeNow: boolean) => {
    if (!shareUrl.trim()) {
      setError('请粘贴抖音分享链接或分享口令。');
      return;
    }
    setError(null);
    setCollected(null);
    try {
      const video = await onSubmit(
        {
          shareUrl: shareUrl.trim(),
          brandName: brandName.trim() || undefined,
          productCategory: productCategory.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        analyzeNow,
      );
      setShareUrl('');
      setNotes('');
      setCollected(video);
    } catch (submitError) {
      setError(errorText(submitError));
    }
  };

  return (
    <article className={`${pageStyles.card} ${workbenchStyles.launch}`} aria-labelledby="competitor-add-title">
      <div className={workbenchStyles.launchHead}>
        <h2 id="competitor-add-title">添加竞品视频</h2>
        <span className={workbenchStyles.launchMeta}>
          只存链接
          <Tooltip
            title="竞品视频只保存抖音链接与识别出的作品信息，不进入原片库和混剪素材池。分析时临时下载原片，完成后删除，保留分析结果与采样图作为证据。"
          >
            <Info size={14} strokeWidth={1.8} className={workbenchStyles.infoIcon} tabIndex={0} aria-label="存储说明" />
          </Tooltip>
        </span>
      </div>
      {!canWrite ? (
        <Alert type="info" showIcon title="当前账号没有素材编辑权限，只能查看竞品拆解。" />
      ) : (
        <form
          className={styles.createForm}
          onSubmit={(event) => {
            event.preventDefault();
            void submit(true);
          }}
        >
          <div className={styles.field}>
            <label htmlFor="competitor-share-url">抖音分享链接</label>
            <TextArea
              id="competitor-share-url"
              value={shareUrl}
              onChange={(event) => setShareUrl(event.target.value)}
              placeholder="粘贴 v.douyin.com 链接，或整段分享口令"
              autoSize={{ minRows: 3, maxRows: 5 }}
              aria-invalid={Boolean(error)}
              aria-describedby="competitor-share-url-help"
            />
            <p id="competitor-share-url-help" className={styles.fieldHelp}>
              同一作品只保留一条；重复添加保留已有资料，可在列表中编辑。
            </p>
          </div>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label htmlFor="competitor-brand">品牌（可选）</label>
              <Input id="competitor-brand" value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="分析后自动识别" />
            </div>
            <div className={styles.field}>
              <label htmlFor="competitor-category">品类（可选）</label>
              <Input
                id="competitor-category"
                value={productCategory}
                onChange={(event) => setProductCategory(event.target.value)}
                placeholder="如 散粉"
              />
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="competitor-notes">备注（可选）</label>
            <Input id="competitor-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="选样理由、来源榜单等" />
          </div>
          {error ? (
            <p className={styles.fieldError} role="alert">
              {error}
            </p>
          ) : null}
          {collected ? (
            <Alert type="success" showIcon title={collectionNotice(collected)}
              action={collected.latestAnalysis ? (
                <Button size="small" onClick={() => onOpen(collected)}>
                  {isAnalysisActive(collected.latestAnalysis) ? '查看进度' : '查看已有分析'}
                </Button>
              ) : undefined}
            />
          ) : null}
          <div className={workbenchStyles.launchFoot}>
            <div className={competitorStyles.addActions}>
              {/* Starts a billable model call: the AI action grammar, like 生成成片. */}
              <AiActionButton htmlType="submit" loading={pending}>
                添加并分析
              </AiActionButton>
              <Button disabled={pending} onClick={() => void submit(false)}>
                仅添加
              </Button>
            </div>
            <p className={workbenchStyles.estimate}>分析约 ¥{ESTIMATED_CNY_PER_VIDEO.toFixed(2)}/条，通常 1–3 分钟完成。</p>
          </div>
        </form>
      )}
    </article>
  );
}
