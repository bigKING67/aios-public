export type GoodsAttributionItem = {
  product_id: string;
  product_name: string;
  gmv: number;
  prev_gmv?: number;
  gmv_delta?: number;
  gmv_delta_contribution?: number;
  buyer_count: number;
  visitor_count: number;
  pay_conversion_rate?: number;
  avg_order_value?: number;
};
