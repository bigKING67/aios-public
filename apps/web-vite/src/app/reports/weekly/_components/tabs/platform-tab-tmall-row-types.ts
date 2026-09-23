export interface GoodsTableRow {
  rowId: string;
  productId: string;
  productName: string;
  gmv: number;
  prevGmv: number;
  gmvWoW: number | undefined;
  gmvDelta: number;
  gmvDeltaContribution: number | undefined;
  buyerCount: number;
  visitorCount: number;
  payConversionRate: number | undefined;
  avgOrderValue: number | undefined;
}

export interface ChannelAttributionRow {
  rowId: string;
  productId: string;
  productName: string;
  trafficChannel: string;
  trafficChannelLabel: string;
  payAmount: number;
  prevPayAmount: number;
  payAmountWoW: number | undefined;
  payAmountDelta: number;
  payAmountDeltaContribution: number | undefined;
  payBuyerCount: number;
  visitorCount: number;
  cartBuyerCount: number;
}
