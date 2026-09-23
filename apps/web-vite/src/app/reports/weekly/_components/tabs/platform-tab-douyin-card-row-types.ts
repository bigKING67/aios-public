export interface DouyinCardProductRow {
  rowId: string;
  productId: string;
  productTitle: string;
  productUrl?: string;
  currCardUserPayAmount: number;
  prevCardUserPayAmount: number;
  cardGmvDelta: number;
  currCardOrderCount: number;
  prevCardOrderCount: number;
  currCardBuyerCount: number;
  prevCardBuyerCount: number;
  currCardExposureUserCount: number;
  prevCardExposureUserCount: number;
  currCardClickUserCount: number;
  prevCardClickUserCount: number;
  currCardCartUserCount: number;
  prevCardCartUserCount: number;
  currCardFavoriteUserCount: number;
  prevCardFavoriteUserCount: number;
}

export interface DouyinCardSourceRow {
  rowId: string;
  sourceLevel1: string;
  currCardExposureUserCount: number;
  prevCardExposureUserCount: number;
  currCardClickUserCount: number;
  prevCardClickUserCount: number;
  currCardBuyerCount: number;
  prevCardBuyerCount: number;
  currCardCartUserCount: number;
  prevCardCartUserCount: number;
  currCardFavoriteUserCount: number;
  prevCardFavoriteUserCount: number;
  currCardBounceUserCount: number;
  prevCardBounceUserCount: number;
  currCardOrderCount: number;
  prevCardOrderCount: number;
  currCardUserPayAmount: number;
  prevCardUserPayAmount: number;
  cardUserPayAmountDelta: number;
  currCardClickRate: number | undefined;
  prevCardClickRate: number | undefined;
  currCardClickToPayRate: number | undefined;
  prevCardClickToPayRate: number | undefined;
}
