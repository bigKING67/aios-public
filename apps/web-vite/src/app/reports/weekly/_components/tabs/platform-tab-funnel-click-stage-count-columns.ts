import type { ColumnsType } from 'antd/es/table';
import type { FunnelChannelRow } from './platform-tab-funnel-types';
import { createIntegerMetricColumn } from './platform-tab-metric-column-builders';

export function buildFunnelClickStageCountColumns(): ColumnsType<FunnelChannelRow> {
  return [
    createIntegerMetricColumn<FunnelChannelRow>('咨询量', 'currWangwangConsultCount', 110),
    createIntegerMetricColumn<FunnelChannelRow>('入会量', 'currMemberJoinCount', 110),
    createIntegerMetricColumn<FunnelChannelRow>('新客数', 'currNewBuyerCount', 110),
    createIntegerMetricColumn<FunnelChannelRow>('领券量', 'currCouponClaimCount', 110),
    createIntegerMetricColumn<FunnelChannelRow>('收藏加购量', 'currTotalFavoriteCartCount', 130),
  ];
}
