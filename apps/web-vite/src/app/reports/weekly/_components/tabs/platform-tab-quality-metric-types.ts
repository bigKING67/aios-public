export type PlatformQualityMetricSource = {
  visitor_count?: unknown;
  prev_visitor_count?: unknown;
  cost?: unknown;
  prev_cost?: unknown;
  pay_cvr?: unknown;
  prev_pay_cvr?: unknown;
  uv_value?: unknown;
  prev_uv_value?: unknown;
  roi?: unknown;
  prev_roi?: unknown;
};

export type PlatformQualityMetricParams = {
  platformData: PlatformQualityMetricSource;
  gmv: number;
  prevGmv?: number;
  buyerCount?: number;
  prevBuyerCount?: number;
  visitorCount?: number;
  prevVisitorCount?: number;
  cost?: number;
  prevCost?: number;
};

export interface PlatformQualityMetricInputs {
  visitorCount: number | undefined;
  prevVisitorCount: number | undefined;
  cost: number | undefined;
  prevCost: number | undefined;
}

export interface PlatformQualityMetrics {
  payCvr: number | undefined;
  prevPayCvr: number | undefined;
  uvValue: number | undefined;
  prevUvValue: number | undefined;
  roi: number | undefined;
  prevRoi: number | undefined;
}
