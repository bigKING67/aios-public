import { Alert, Button, Skeleton } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { findPreset, pickDefaultPreset } from '../_lib/segment-display';
import { SegmentAnnotationView } from './segment-annotation-view';
import { SegmentLibraryView } from './segment-library-view';
import { useStudioPresets } from './use-ai-studio-queries';
import pageStyles from '../ai-studio.module.css';

/**
 * `/content/ai-studio/segments` owns two URL-addressable views: the global
 * segment list, and `?assetId=` annotation of one source asset
 * (`&segmentId=` focuses a row). `presetKey` selects the preset in both.
 */
export function SegmentsWorkspace({
  canWrite,
  openAccess,
  products = [],
}: {
  canWrite: boolean;
  openAccess: boolean;
  /** Enterprise product catalog for product pickers. */
  products?: readonly string[];
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const presetsQuery = useStudioPresets(true);
  const assetId = searchParams.get('assetId')?.trim() ?? '';
  const segmentId = searchParams.get('segmentId')?.trim() || null;

  if (presetsQuery.isPending) {
    return <div className={pageStyles.card} aria-busy="true"><Skeleton active paragraph={{ rows: 5 }} /></div>;
  }
  if (presetsQuery.isError) {
    return (
      <Alert
        type="error"
        showIcon
        title="分类预设读取失败"
        description={presetsQuery.error instanceof Error ? presetsQuery.error.message : '请求失败'}
        action={<Button onClick={() => void presetsQuery.refetch()}>重试</Button>}
      />
    );
  }

  const presets = presetsQuery.data;
  const requestedKey = searchParams.get('presetKey');
  const active = presets.filter((preset) => preset.status === 'active');
  const preset = (requestedKey
    ? active.filter((item) => item.presetKey === requestedKey).sort((a, b) => b.version - a.version)[0]
    : undefined) ?? pickDefaultPreset(presets);

  if (!preset) {
    return (
      <article className={pageStyles.card}>
        <h2>还没有可用的分类预设</h2>
        <p>片段标注依赖分类预设（例如“框架 v1”）。请联系管理员确认预设已发布。</p>
      </article>
    );
  }

  const changePreset = (presetKey: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('presetKey', presetKey);
      next.delete('labelKey');
      return next;
    }, { replace: true });
  };

  if (assetId) {
    return (
      <SegmentAnnotationView
        assetId={assetId}
        focusSegmentId={segmentId}
        canWrite={canWrite}
        openAccess={openAccess}
        presets={presets}
        preset={findPreset(presets, preset.presetKey, preset.version) ?? preset}
        onPresetChange={changePreset}
      />
    );
  }
  return <SegmentLibraryView presets={presets} preset={preset} canWrite={canWrite} products={products} />;
}
