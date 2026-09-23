#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.log('用法: node backend-rust/scripts/evaluate_k6_summary.js <k6-summary.json>');
  console.log('可选环境变量:');
  console.log('  FAIL_RATE_MAX=0.01   # 默认失败率上限 1%');
  console.log('  P95_MAX_MS=1200      # 默认 P95 上限 1200ms');
  console.log('  P99_MAX_MS=2000      # 默认 P99 上限 2000ms');
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMs(value) {
  if (!Number.isFinite(value)) {
    return 'N/A';
  }
  return `${value.toFixed(2)}ms`;
}

function formatRate(rate) {
  if (!Number.isFinite(rate)) {
    return 'N/A';
  }
  return `${(rate * 100).toFixed(2)}%`;
}

function formatReqRate(rate) {
  if (!Number.isFinite(rate)) {
    return 'N/A';
  }
  return `${rate.toFixed(2)} req/s`;
}

function metricValue(metric, key) {
  return metric && metric.values ? metric.values[key] : undefined;
}

function parseScenarioName(metricKey) {
  const match = metricKey.match(/scenario:([^,}]+)/);
  return match ? match[1] : null;
}

function metricStatus(label, actual, threshold, comparator) {
  const pass = comparator(actual, threshold);
  return {
    label,
    pass,
    actual,
    threshold,
  };
}

function printStatusLine(status, formatter) {
  const result = status.pass ? 'PASS' : 'FAIL';
  console.log(
    `- [${result}] ${status.label}: ${formatter(status.actual)} (阈值: ${formatter(status.threshold)})`
  );
}

function buildScenarioDurationMap(metrics) {
  const scenarioMap = {};
  for (const [key, metric] of Object.entries(metrics)) {
    if (!key.startsWith('http_req_duration{')) {
      continue;
    }
    const scenarioName = parseScenarioName(key);
    if (!scenarioName) {
      continue;
    }
    scenarioMap[scenarioName] = metric;
  }
  return scenarioMap;
}

function readSummary(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

function ensureSummaryShape(summary) {
  if (!summary || typeof summary !== 'object' || !summary.metrics) {
    throw new Error('k6 summary JSON 结构不正确，缺少 metrics 字段');
  }
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    usage();
    process.exit(1);
  }

  const failRateMax = parseNumber(process.env.FAIL_RATE_MAX, 0.01);
  const p95MaxMs = parseNumber(process.env.P95_MAX_MS, 1200);
  const p99MaxMs = parseNumber(process.env.P99_MAX_MS, 2000);

  let summary;
  try {
    summary = readSummary(filePath);
    ensureSummaryShape(summary);
  } catch (error) {
    console.error(`读取或解析失败: ${error.message}`);
    process.exit(1);
  }

  const { metrics } = summary;
  const httpDuration = metrics.http_req_duration || {};
  const httpFailed = metrics.http_req_failed || {};
  const httpReqs = metrics.http_reqs || {};

  const overallP95 = parseNumber(metricValue(httpDuration, 'p(95)'), NaN);
  const overallP99 = parseNumber(metricValue(httpDuration, 'p(99)'), NaN);
  const overallFailRate = parseNumber(metricValue(httpFailed, 'rate'), NaN);
  const totalReqs = parseNumber(metricValue(httpReqs, 'count'), NaN);
  const reqRate = parseNumber(metricValue(httpReqs, 'rate'), NaN);

  const overallStatuses = [
    metricStatus('整体失败率', overallFailRate, failRateMax, (a, b) => a <= b),
    metricStatus('整体 P95 延迟', overallP95, p95MaxMs, (a, b) => a <= b),
    metricStatus('整体 P99 延迟', overallP99, p99MaxMs, (a, b) => a <= b),
  ];

  console.log('=== k6 报表接口压测评估 ===');
  console.log(`样本文件: ${filePath}`);
  console.log(`总请求数: ${Number.isFinite(totalReqs) ? totalReqs : 'N/A'}`);
  console.log(`平均吞吐: ${formatReqRate(reqRate)}`);
  console.log('');
  console.log('[整体指标]');
  printStatusLine(overallStatuses[0], formatRate);
  printStatusLine(overallStatuses[1], formatMs);
  printStatusLine(overallStatuses[2], formatMs);

  const scenarioDurationMap = buildScenarioDurationMap(metrics);
  const scenarioNames = Object.keys(scenarioDurationMap);

  if (scenarioNames.length > 0) {
    console.log('');
    console.log('[分场景延迟]');
    for (const scenarioName of scenarioNames.sort()) {
      const metric = scenarioDurationMap[scenarioName];
      const p95 = parseNumber(metricValue(metric, 'p(95)'), NaN);
      const p99 = parseNumber(metricValue(metric, 'p(99)'), NaN);
      const p95Status = metricStatus(`${scenarioName} P95`, p95, p95MaxMs, (a, b) => a <= b);
      const p99Status = metricStatus(`${scenarioName} P99`, p99, p99MaxMs, (a, b) => a <= b);
      printStatusLine(p95Status, formatMs);
      printStatusLine(p99Status, formatMs);
    }
  }

  const allPass = overallStatuses.every((item) => item.pass);
  console.log('');
  console.log(`结论: ${allPass ? '达标' : '未达标'}`);
  process.exit(allPass ? 0 : 2);
}

main();
