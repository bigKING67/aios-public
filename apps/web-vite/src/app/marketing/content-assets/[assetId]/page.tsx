import { Navigate, useParams } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { ContentAssetDetailClient } from '../_components/content-asset-detail-client';

export default function ContentAssetDetailPage() {
  const { assetId } = useParams<{ assetId: string }>();
  if (!assetId) {
    return <Navigate to={ROUTE_PATHS.marketingContentAssets} replace />;
  }

  return <ContentAssetDetailClient assetId={assetId} />;
}
