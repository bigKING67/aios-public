import { Alert, Button, Input, Modal, TextArea, Tooltip } from '@lobehub/ui';
import { ChevronRight, Info } from 'lucide-react';
import { useRef, useState } from 'react';
import { AiActionButton } from '@/components/molecules/ai-action-button';
import { FormField } from '@/components/molecules/form-field';
import { bindTextField, ControlledFormValidationError, useControlledForm } from '@/hooks/use-controlled-form';
import type { StudioCreateCompetitorVideoRequest } from '@/lib/generated-api-contract';
import { ESTIMATED_CNY_PER_VIDEO } from '../_lib/competitor-api';
import styles from './competitor-add-modal.module.css';

interface CompetitorAddModalProps {
  open: boolean;
  onClose: () => void;
  onAfterClose: () => void;
  onSubmit: (request: StudioCreateCompetitorVideoRequest, analyzeNow: boolean) => Promise<void>;
}

/** Draft stays alive when closed; only an acknowledged submission clears it. */
export function CompetitorAddModal({ open, onClose, onAfterClose, onSubmit }: CompetitorAddModalProps) {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const form = useControlledForm({
    initialValues: { shareUrl: '', brandName: '', productCategory: '', notes: '' },
    rules: { shareUrl: [{ required: true, whitespace: true, message: '请粘贴抖音分享链接或分享口令。' }] },
  });

  const submit = async (analyzeNow: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const values = await form.validateFields();
      setPending(true);
      setError(null);
      await onSubmit({
        shareUrl: values.shareUrl.trim(),
        brandName: values.brandName.trim() || undefined,
        productCategory: values.productCategory.trim() || undefined,
        notes: values.notes.trim() || undefined,
      }, analyzeNow);
      form.resetFields();
      setDetailsOpen(false);
    } catch (submitError) {
      if (!(submitError instanceof ControlledFormValidationError)) {
        setError(submitError instanceof Error ? submitError.message : '添加失败，请稍后重试。');
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      title="添加竞品视频"
      width={560}
      draggable={false}
      onCancel={onClose}
      afterClose={onAfterClose}
      keyboard={!pending}
      maskClosable={!pending}
      closable={!pending}
      footer={null}
    >
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void submit(true); }}>
        <p className={styles.intro}>
          粘贴抖音分享链接或整段口令，即可加入竞品视频。
          <Tooltip title="只保存链接与作品信息，不进入原片库或混剪素材池。分析时临时下载原片，完成后只保留开头片段和段落首帧作为证据。">
            <button type="button" className={styles.info} aria-label="视频存储说明"><Info size={14} /></button>
          </Tooltip>
        </p>
        <fieldset disabled={pending} className={styles.fields}>
          <FormField form={form} name="shareUrl" label="抖音分享链接">
            <TextArea {...bindTextField(form, 'shareUrl')} autoFocus autoSize={{ minRows: 3, maxRows: 5 }} placeholder="粘贴 v.douyin.com 链接，或整段分享口令" />
          </FormField>
          <details className={styles.details} open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
            <summary><ChevronRight size={14} aria-hidden />补充信息<span>可选</span></summary>
            <div className={styles.optionalFields}>
              <div className={styles.pair}>
                <FormField form={form} name="brandName" label="品牌">
                  <Input {...bindTextField(form, 'brandName')} placeholder="分析后自动识别" />
                </FormField>
                <FormField form={form} name="productCategory" label="品类">
                  <Input {...bindTextField(form, 'productCategory')} placeholder="如 散粉" />
                </FormField>
              </div>
              <FormField form={form} name="notes" label="备注">
                <Input {...bindTextField(form, 'notes')} placeholder="选样理由、来源榜单等" />
              </FormField>
              <p className={styles.hint}>同一作品只保留一条；重复添加保留已有资料，可在列表中编辑。</p>
            </div>
          </details>
        </fieldset>
        {error ? <Alert type="error" showIcon title={error} /> : null}
        <div className={styles.footer}>
          <p className={styles.hint}>分析约 ¥{ESTIMATED_CNY_PER_VIDEO.toFixed(2)}/条 · 通常 1–3 分钟</p>
          <div className={styles.actions}>
            <Button disabled={pending} onClick={() => void submit(false)}>仅添加</Button>
            <AiActionButton htmlType="submit" disabled={pending} loading={pending}>添加并分析</AiActionButton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
