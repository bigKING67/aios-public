import type {
  CreatorLibraryBdUser as ApiCreatorLibraryBdUser,
  CreatorLibraryFilterOptions as ApiCreatorLibraryFilterOptions,
  CreatorLibraryFollowLogItem as ApiCreatorLibraryFollowLogItem,
  CreatorLibraryFollowLogListResponse as ApiCreatorLibraryFollowLogListResponse,
  CreatorLibraryItem as ApiCreatorLibraryItem,
  CreatorLibraryListResponse as ApiCreatorLibraryListResponse,
  CreatorLibrarySummary as ApiCreatorLibrarySummary,
} from '@/lib/generated-api-contract';

export interface CreatorLibraryItem extends Omit<ApiCreatorLibraryItem, 'ownershipType'> {
  ownershipType: 'public_seed' | 'owned' | 'bd_owned';
}

export type CreatorLibrarySummary = ApiCreatorLibrarySummary;

export type CreatorLibraryFilterOptions = ApiCreatorLibraryFilterOptions;

export type CreatorLibraryBdUser = ApiCreatorLibraryBdUser;

export interface CreatorLibraryListResponse extends Omit<ApiCreatorLibraryListResponse, 'items'> {
  items: CreatorLibraryItem[];
}

export interface CreatorLibraryDetailResponse {
  item: CreatorLibraryItem;
}

export type CreatorLibraryFollowLogItem = ApiCreatorLibraryFollowLogItem;

export type CreatorLibraryFollowLogsResponse = ApiCreatorLibraryFollowLogListResponse;

export interface CreatorLibraryFollowLogResponse {
  item: CreatorLibraryFollowLogItem;
}

export interface CreatorLibraryFollowLogPayload {
  follow_note: string;
  expected_updated_at?: string | null;
  updated_at?: string | null;
}

export interface CreatorLibraryImportResponse {
  imported: number;
  failed: number;
  errors: Array<{
    row: number;
    message: string;
  }>;
}

export interface CreatorLibraryFilters {
  keyword?: string;
  platform?: string;
  category?: string;
  anchorTags?: string[];
  fansBand?: string;
  anchorLevel?: string;
  cooperationStatus?: string;
  ownerName?: string;
  ownerUserId?: string;
  lastFollowRange?: string;
  isCooperable?: 'true' | 'false';
  sourceType?: string;
  ownershipScope?: 'public_seed' | 'mine' | 'others';
  mcnStatus?: 'registered' | 'missing';
}

export type CreatorLibrarySort =
  | 'owner_priority_desc'
  | 'updated_at_desc'
  | 'updated_at_asc'
  | 'identity_asc'
  | 'identity_desc'
  | 'name_asc'
  | 'name_desc'
  | 'platform_asc'
  | 'platform_desc'
  | 'fans_desc'
  | 'fans_asc'
  | 'anchor_tag_asc'
  | 'anchor_tag_desc'
  | 'anchor_level_asc'
  | 'anchor_level_desc'
  | 'sales_30d_desc'
  | 'sales_30d_asc'
  | 'sales_90d_desc'
  | 'sales_90d_asc'
  | 'status_asc'
  | 'status_desc'
  | 'owner_asc'
  | 'owner_desc'
  | 'last_follow_asc'
  | 'last_follow_desc';

export const DEFAULT_CREATOR_LIBRARY_SORT: CreatorLibrarySort = 'owner_priority_desc';

export interface CreatorLibraryQueryParams extends CreatorLibraryFilters {
  page: number;
  pageSize: number;
  sort: CreatorLibrarySort;
}

export interface CreatorLibraryPayload {
  platform: string;
  influencer_name: string;
  influencer_id?: string | null;
  douyin_handle?: string | null;
  phone?: string | null;
  mcn?: string | null;
  category?: string | null;
  anchor_desc?: string | null;
  anchor_level?: string | null;
  main_platform_fans?: string | null;
  sales_30d?: string | null;
  sales_90d?: string | null;
  tags?: string[];
  cooperation_status?: string | null;
  cooperation_desc?: string | null;
  owner_name?: string | null;
  owner_user_id?: string | null;
  is_cooperable?: boolean;
  follow_note?: string | null;
  expected_updated_at?: string | null;
  updated_at?: string | null;
}

export interface CreatorLibraryFormValues {
  platform?: string;
  influencerName?: string;
  influencerId?: string;
  douyinHandle?: string;
  phone?: string;
  mcn?: string;
  category?: string;
  anchorDesc?: string;
  anchorLevel?: string;
  mainPlatformFans?: string;
  sales30d?: string;
  sales90d?: string;
  tags?: string[];
  cooperationStatus?: string;
  cooperationDesc?: string;
  ownerName?: string;
  ownerUserId?: string;
  isCooperable?: boolean;
}

export interface CreatorLibraryCsvRow {
  platform: string;
  influencerName: string;
  influencerId?: string;
  douyinHandle?: string;
  phone?: string;
  mcn?: string;
  category?: string;
  mainPlatformFans?: string;
  anchorLevel?: string;
  anchorDesc?: string;
  sales30d?: string;
  sales90d?: string;
  cooperationStatus?: string;
  isCooperable?: boolean;
  ownerName?: string;
  followNote?: string;
  cooperationDesc?: string;
  rowNumber: number;
  error?: string;
}
