export interface DashboardPageClientInitialFilters {
  dimension?: string;
  tab?: string;
  mode?: string;
  day?: string;
  week?: string;
  month?: string;
  year?: string;
  start?: string;
  end?: string;
}

export interface DashboardPageClientProps {
  initialFilters?: DashboardPageClientInitialFilters;
}
