import type { NumericInput } from './dashboard-formatters';
import type { DashboardLiveDataDateBounds } from './dashboard-live-types';

export type ShortVideoScope = 'all' | 'self' | 'cooperation';

export interface DashboardShortVideoTotals {
  shortvideo_count: NumericInput;
  video_view_count: NumericInput;
  shortvideo_gmv: NumericInput;
  shortvideo_user_pay_amount: NumericInput;
  shortvideo_refund_amount: NumericInput;
  shortvideo_live_room_pay_amount: NumericInput;
  shortvideo_search_after_view_pay_amount: NumericInput;
  shortvideo_shop_page_pay_amount: NumericInput;
  shortvideo_play_to_pay_rate: NumericInput;
  shortvideo_refund_rate: NumericInput;
  author_count: NumericInput;
}

export interface DashboardShortVideoTrendRow {
  date: string;
  shortvideo_gmv: NumericInput;
  shortvideo_gsv: NumericInput;
  gpv: NumericInput;
}

export interface DashboardShortVideoDetailRow {
  stat_date?: string;
  publish_time?: string | null;
  account_type: string;
  video_title: string;
  video_id: string;
  is_promoted: string;
  play_url?: string | null;
  author_nickname: string;
  author_douyin_id: string;
  product_id: string;
  video_view_count: NumericInput;
  user_pay_amount: NumericInput;
  refund_amount: NumericInput;
  live_room_pay_amount: NumericInput;
  search_after_view_pay_amount: NumericInput;
  shop_page_pay_amount: NumericInput;
}

export interface DashboardShortVideoSectionPayload {
  currentTotals: DashboardShortVideoTotals;
  previousTotals: DashboardShortVideoTotals;
  trend: DashboardShortVideoTrendRow[];
  rows: DashboardShortVideoDetailRow[];
}

export interface DashboardShortVideoOverviewPayload {
  currentTotals: DashboardShortVideoTotals;
  previousTotals: DashboardShortVideoTotals;
  trend: DashboardShortVideoTrendRow[];
}

export interface DashboardShortVideoApiResponse {
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  platform: 'douyin';
  asOfDate?: string | null;
  dataDateBounds?: DashboardLiveDataDateBounds | null;
  overview: DashboardShortVideoOverviewPayload;
  selfOperated: DashboardShortVideoSectionPayload;
  cooperation: DashboardShortVideoSectionPayload;
}
