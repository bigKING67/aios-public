export interface DouyinMetricDetailRow {
  key: string;
  metric: string;
  curr: number;
  prev: number;
  formatter: (value: number) => string;
}
