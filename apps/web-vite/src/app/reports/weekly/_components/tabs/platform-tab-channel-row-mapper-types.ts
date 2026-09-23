export type ChannelAttributionItem = {
  product_id: string;
  product_name: string;
  traffic_channel: string;
  pay_amount: number;
  prev_pay_amount?: number;
  pay_amount_delta?: number;
  pay_amount_delta_contribution?: number;
  pay_buyer_count: number;
  visitor_count: number;
  cart_buyer_count: number;
};
