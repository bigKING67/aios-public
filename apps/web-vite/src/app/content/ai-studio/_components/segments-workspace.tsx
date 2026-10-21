import { Alert, Button, Skeleton } from 'antd';
import { Navigate, useSearchParams } from 'react-router-dom';
import { findPreset, isSellingPointPreset, pickDefaultPreset, SELLING_POINT_PRESET_KEY } from '../_lib/segment-display';
import { segmentListPath, type SegmentKind } from '../_lib/segment-routes';
import { SegmentAnnotationView } from './segment-annotation-view';
import { SegmentLibraryView } from './segment-library-view';
import { useStudioPresets } from './use-ai-studio-queries';
import pageStyles from '../ai-studio.module.css';

/**
 * 框架片段 (`/segments`) and 卖点片段 (`/selling-points`) each own two
 * URL-addressable views: the segment list of their kind, and `?assetId=`
 * annotation of one source asset (`&segmentId=` focuses a row). The list is
 * fixed to its kind's presets; annotation may switch to any active preset.
 */
export function SegmentsWorkspace({
  kind,
  canWrite,
  openAccess,
  products = [],
}: {
  kind: SegmentKind;
  canWrite: boolean;
  openAccess: boolean;
  /** Enterprise product catalog for product pickers. */
  products?: readonly string[];
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const presetsQuery = useStudioPresets(true);
  const assetId = searchParams.get('assetId')?.trim() ?? '';
  const segmentId = searchParams.get('segmentId')?.trim() || null;
  const requestedKey = searchParams.get('presetKey');
  // A selling-point preset belongs under 卖点片段 (old 片段素材 links and preset switches).
  const wrongRoute = kind === 'framework' ? requestedKey === SELLING_POINT_PRESET_KEY : requestedKey !== null && requestedKey !== SELLING_POINT_PRESET_KEY;
  const otherKind: SegmentKind = kind === 'framework' ? 'sellingPoint' : 'framework';

  if (wrongRoute) {
    const next = new URLSearchParams(searchParams);
    // The list of each kind is fixed to its presets; annotation keeps the key.
    if (!assetId) next.delete('presetKey');
    const query = next.toString();
    return <Navigate replace to={`${segmentListPath(otherKind)}${query ? `?${query}` : ''}`} />;
  }
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
  const ofKind = presets.filter((item) => isSellingPointPreset(item) === (kind === 'sellingPoint'));
  // The list stays on its kind; annotation may switch to any active preset.
  const pool = assetId ? presets : ofKind;
  const active = pool.filter((preset) => preset.status === 'active');
  const preset = (requestedKey
    ? active.filter((item) => item.presetKey === requestedKey).sort((a, b) => b.version - a.version)[0]
    : undefined) ?? pickDefaultPreset(ofKind);

  if (!preset) {
    return (
      <article className={pageStyles.card}>
        <h2>{kind === 'sellingPoint' ? '还没有可用的卖点预设' : '还没有可用的分类预设'}</h2>
        <p>片段标注依赖分类预设（例如“{kind === 'sellingPoint' ? '卖点 v1' : '框架 v1'}”）。请联系管理员确认预设已发布。</p>
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
  return (
    <SegmentLibraryView
      kind={kind}
      presets={presets}
      kindPresets={ofKind}
      preset={preset}
      canWrite={canWrite}
      products={products}
    />
  );
}
