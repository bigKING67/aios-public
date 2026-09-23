import { CACHE_CONFIG } from './report-api/request-policy';
import {
  getAllWeeklyPeriods,
  getLatestWeeklyPeriod,
  getWeeklyMetadata,
  getWeeklyReport,
  listReports,
} from './report-api/weekly';
import {
  getAllMonthlyPeriods,
  getLatestMonthlyPeriod,
  getMonthlyMetadata,
  getMonthlyReport,
} from './report-api/monthly';
import {
  generateSummary,
  getSummary,
  getSummaryStatus,
  type WeeklySummaryConclusionsInput,
  updateSummary,
} from './report-api/summary';

export { CACHE_CONFIG };
export type { WeeklySummaryConclusionsInput };

export const reportApi = {
  getWeeklyReport,
  getLatestWeeklyPeriod,
  getAllWeeklyPeriods,
  getWeeklyMetadata,
  listReports,
  getMonthlyReport,
  getLatestMonthlyPeriod,
  getAllMonthlyPeriods,
  getMonthlyMetadata,
  generateSummary,
  getSummaryStatus,
  getSummary,
  updateSummary,
};

export default reportApi;
