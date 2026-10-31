import { Alert, Input, Modal } from '@lobehub/ui';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { competitorQueryKeys, updateCompetitorVideo, type StudioCompetitorVideo } from '../_lib/competitor-api';
import styles from './segment-annotation.module.css';

export function CompetitorVideoEdit({ video, onClose }: { video: StudioCompetitorVideo; onClose: () => void }) {
  const [brandName, setBrand] = useState(video.brandName ?? '');
  const [productCategory, setCategory] = useState(video.productCategory ?? '');
  const [notes, setNotes] = useState(video.notes ?? '');
  const client = useQueryClient();
  const mutation = useMutation({ retry: false, mutationFn: () => updateCompetitorVideo(video.awemeId, { brandName, productCategory, notes }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: competitorQueryKeys.videos() }); onClose(); },
  });
  return <Modal open title="编辑竞品资料" okText="保存" cancelText="取消" confirmLoading={mutation.isPending}
    onOk={() => mutation.mutate()} onCancel={() => { if (!mutation.isPending) onClose(); }}>
    <div className={styles.createForm}>
      <div className={styles.field}><label htmlFor="competitor-edit-brand">品牌</label><Input id="competitor-edit-brand" value={brandName} maxLength={120} onChange={(e) => setBrand(e.target.value)} /></div>
      <div className={styles.field}><label htmlFor="competitor-edit-category">品类</label><Input id="competitor-edit-category" value={productCategory} maxLength={120} onChange={(e) => setCategory(e.target.value)} /></div>
      <div className={styles.field}><label htmlFor="competitor-edit-notes">备注</label><Input id="competitor-edit-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} /></div>
      {mutation.isError ? <Alert type="error" title={mutation.error.message} /> : null}
    </div>
  </Modal>;
}
