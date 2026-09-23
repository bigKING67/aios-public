export interface DouyinShortvideoRow {
  rowId: string;
  videoId: string;
  videoTitle: string;
  authorNickname: string;
  authorDouyinId: string;
  productId: string;
  publishTime: string;
  isPromoted: string;
  playUrl?: string;
  currVideoViewCount: number;
  prevVideoViewCount: number;
  currUserPayAmount: number;
  prevUserPayAmount: number;
  userPayAmountDelta: number;
  currRefundAmount: number;
  prevRefundAmount: number;
  currLiveRoomPayAmount: number;
  prevLiveRoomPayAmount: number;
  currSearchAfterViewPayAmount: number;
  prevSearchAfterViewPayAmount: number;
  currShopPagePayAmount: number;
  prevShopPagePayAmount: number;
}
