import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const API_PREFIX = `${BASE_URL}/v1/reports`;
const AUTH_TOKEN = (__ENV.AUTH_TOKEN || '').trim();

const DETAIL_RATE = Number(__ENV.DETAIL_RATE || 60);
const PERIOD_RATE = Number(__ENV.PERIOD_RATE || 20);
const TEST_DURATION = __ENV.TEST_DURATION || '2m';

function buildHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (AUTH_TOKEN) {
    headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  }
  return headers;
}

const requestParams = {
  headers: buildHeaders(),
  timeout: __ENV.K6_TIMEOUT || '10s',
};

export const options = {
  scenarios: {
    report_detail_by_period: {
      executor: 'constant-arrival-rate',
      exec: 'detailTraffic',
      rate: DETAIL_RATE,
      timeUnit: '1s',
      duration: TEST_DURATION,
      preAllocatedVUs: Number(__ENV.DETAIL_PRE_VUS || 20),
      maxVUs: Number(__ENV.DETAIL_MAX_VUS || 120),
    },
    report_period_lists: {
      executor: 'constant-arrival-rate',
      exec: 'periodListTraffic',
      rate: PERIOD_RATE,
      timeUnit: '1s',
      duration: TEST_DURATION,
      preAllocatedVUs: Number(__ENV.PERIOD_PRE_VUS || 10),
      maxVUs: Number(__ENV.PERIOD_MAX_VUS || 80),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1200', 'p(99)<2000'],
  },
};

function ensureStatusOk(response, hint) {
  const ok = check(response, {
    [`${hint} status is 200`]: (res) => res.status === 200,
  });

  if (!ok) {
    fail(`${hint} failed with status ${response.status}: ${response.body}`);
  }
}

function randomPick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function setup() {
  if (!AUTH_TOKEN) {
    fail('AUTH_TOKEN is required for report APIs.');
  }

  const weeklyPeriodsResp = http.get(
    `${API_PREFIX}/weekly/all-periods?limit=200`,
    requestParams
  );
  ensureStatusOk(weeklyPeriodsResp, 'weekly/all-periods');

  const monthlyPeriodsResp = http.get(
    `${API_PREFIX}/monthly/all-periods?limit=200`,
    requestParams
  );
  ensureStatusOk(monthlyPeriodsResp, 'monthly/all-periods');

  const weeklyPeriods = (weeklyPeriodsResp.json('periods') || [])
    .map((item) => item.value)
    .filter(Boolean);
  const monthlyPeriods = (monthlyPeriodsResp.json('periods') || [])
    .map((item) => item.value)
    .filter(Boolean);

  if (weeklyPeriods.length === 0) {
    fail('No weekly periods found. Please prepare ADS weekly data first.');
  }
  if (monthlyPeriods.length === 0) {
    fail('No monthly periods found. Please prepare ADS monthly data first.');
  }

  return { weeklyPeriods, monthlyPeriods };
}

export function detailTraffic(data) {
  const weekPeriod = randomPick(data.weeklyPeriods);
  const monthPeriod = randomPick(data.monthlyPeriods);

  const weeklyDetailResp = http.get(
    `${API_PREFIX}/weekly/by-period?week_period=${encodeURIComponent(weekPeriod)}`,
    requestParams
  );
  ensureStatusOk(weeklyDetailResp, 'weekly/by-period');

  const monthlyDetailResp = http.get(
    `${API_PREFIX}/monthly/by-period?month_period=${encodeURIComponent(monthPeriod)}`,
    requestParams
  );
  ensureStatusOk(monthlyDetailResp, 'monthly/by-period');

  sleep(Math.random() * 0.2);
}

export function periodListTraffic() {
  const weeklyResp = http.get(`${API_PREFIX}/weekly/all-periods?limit=100`, requestParams);
  ensureStatusOk(weeklyResp, 'weekly/all-periods');

  const monthlyResp = http.get(`${API_PREFIX}/monthly/all-periods?limit=100`, requestParams);
  ensureStatusOk(monthlyResp, 'monthly/all-periods');

  sleep(Math.random() * 0.3);
}
