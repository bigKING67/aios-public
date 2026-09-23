#!/usr/bin/env python3
"""
零依赖时间筛选压测脚本（标准库实现）

场景覆盖：
1) weekly/monthly by-period 详情接口
2) weekly/monthly all-periods 列表接口

输出：
- 总请求数
- 吞吐(req/s)
- 失败率
- p50/p95/p99
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import random
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple


@dataclass
class RequestResult:
    ok: bool
    latency_ms: float
    endpoint: str
    status_code: int
    error: Optional[str] = None


@dataclass
class LoadSummary:
    total: int
    success: int
    failed: int
    duration_s: float
    qps: float
    fail_rate: float
    p50: float
    p95: float
    p99: float
    endpoint_stats: Dict[str, Dict[str, float]]


def read_secret_key_from_env_file(env_file: Path) -> str:
    if not env_file.exists():
        raise FileNotFoundError(f"missing env file: {env_file}")
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("SECRET_KEY="):
            return line.split("=", 1)[1].strip()
    raise ValueError("SECRET_KEY not found in env file")


def b64url(payload: bytes) -> str:
    return base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")


def generate_test_jwt(secret_key: str, expire_seconds: int = 3600) -> str:
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": "loadtest-user",
        "typ": "access",
        "exp": now + expire_seconds,
        "iat": now,
        "jti": uuid.uuid4().hex,
        "username": "loadtest-user",
        "roles": ["admin"],
        "permissions": ["reports:read", "report:view:all", "report:view:shared", "report:view:own"],
    }
    seg1 = b64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    seg2 = b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(
        secret_key.encode("utf-8"),
        f"{seg1}.{seg2}".encode("utf-8"),
        hashlib.sha256,
    ).digest()
    seg3 = b64url(signature)
    return f"{seg1}.{seg2}.{seg3}"


def percentile(values: List[float], p: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    sorted_values = sorted(values)
    rank = (len(sorted_values) - 1) * p
    lower = int(rank)
    upper = min(lower + 1, len(sorted_values) - 1)
    weight = rank - lower
    return sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight


def http_get(url: str, token: str, timeout_s: float) -> RequestResult:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url=url, method="GET", headers=headers)
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            _ = resp.read()
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            status_code = int(getattr(resp, "status", 200))
            return RequestResult(
                ok=(200 <= status_code < 300),
                latency_ms=elapsed_ms,
                endpoint=url,
                status_code=status_code,
            )
    except urllib.error.HTTPError as exc:
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return RequestResult(
            ok=False,
            latency_ms=elapsed_ms,
            endpoint=url,
            status_code=int(exc.code),
            error=f"HTTPError: {exc.reason}",
        )
    except Exception as exc:  # noqa: BLE001
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return RequestResult(
            ok=False,
            latency_ms=elapsed_ms,
            endpoint=url,
            status_code=0,
            error=f"{type(exc).__name__}: {exc}",
        )


def fetch_periods(base_url: str, token: str, timeout_s: float) -> Tuple[List[str], List[str]]:
    weekly_url = f"{base_url}/v1/reports/weekly/all-periods?limit=200"
    monthly_url = f"{base_url}/v1/reports/monthly/all-periods?limit=200"
    weekly_resp = http_get(weekly_url, token, timeout_s)
    monthly_resp = http_get(monthly_url, token, timeout_s)
    if not weekly_resp.ok:
        raise RuntimeError(f"fetch weekly periods failed: {weekly_resp.status_code} {weekly_resp.error}")
    if not monthly_resp.ok:
        raise RuntimeError(f"fetch monthly periods failed: {monthly_resp.status_code} {monthly_resp.error}")

    weekly_body = urllib.request.urlopen(
        urllib.request.Request(
            url=weekly_url,
            method="GET",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        ),
        timeout=timeout_s,
    ).read()
    monthly_body = urllib.request.urlopen(
        urllib.request.Request(
            url=monthly_url,
            method="GET",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        ),
        timeout=timeout_s,
    ).read()

    weekly_data = json.loads(weekly_body.decode("utf-8"))
    monthly_data = json.loads(monthly_body.decode("utf-8"))
    weekly_periods = [item["value"] for item in weekly_data.get("periods", []) if item.get("value")]
    monthly_periods = [item["value"] for item in monthly_data.get("periods", []) if item.get("value")]
    if not weekly_periods:
        raise RuntimeError("no weekly periods found")
    if not monthly_periods:
        raise RuntimeError("no monthly periods found")
    return weekly_periods, monthly_periods


def endpoint_key(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    return parsed.path


def build_summary(results: List[RequestResult], elapsed_s: float) -> LoadSummary:
    latencies = [item.latency_ms for item in results]
    total = len(results)
    success = sum(1 for item in results if item.ok)
    failed = total - success
    qps = total / elapsed_s if elapsed_s > 0 else 0.0
    fail_rate = failed / total if total > 0 else 0.0

    endpoint_bucket: Dict[str, List[RequestResult]] = {}
    for item in results:
        key = endpoint_key(item.endpoint)
        endpoint_bucket.setdefault(key, []).append(item)

    endpoint_stats: Dict[str, Dict[str, float]] = {}
    for key, rows in endpoint_bucket.items():
        row_lat = [r.latency_ms for r in rows]
        row_failed = sum(1 for r in rows if not r.ok)
        endpoint_stats[key] = {
            "count": float(len(rows)),
            "qps": float(len(rows) / elapsed_s if elapsed_s > 0 else 0.0),
            "fail_rate": float(row_failed / len(rows) if rows else 0.0),
            "p95": float(percentile(row_lat, 0.95)),
            "p99": float(percentile(row_lat, 0.99)),
        }

    return LoadSummary(
        total=total,
        success=success,
        failed=failed,
        duration_s=elapsed_s,
        qps=qps,
        fail_rate=fail_rate,
        p50=percentile(latencies, 0.50),
        p95=percentile(latencies, 0.95),
        p99=percentile(latencies, 0.99),
        endpoint_stats=endpoint_stats,
    )


def run_loadtest(
    base_url: str,
    token: str,
    weekly_periods: List[str],
    monthly_periods: List[str],
    duration_s: int,
    detail_rate: int,
    period_rate: int,
    workers: int,
    timeout_s: float,
) -> List[RequestResult]:
    results: List[RequestResult] = []
    results_lock = threading.Lock()

    def push_result(result: RequestResult) -> None:
        with results_lock:
            results.append(result)

    def detail_task() -> None:
        week_period = random.choice(weekly_periods)
        month_period = random.choice(monthly_periods)
        week_url = (
            f"{base_url}/v1/reports/weekly/by-period"
            f"?week_period={urllib.parse.quote(week_period, safe='')}"
        )
        month_url = (
            f"{base_url}/v1/reports/monthly/by-period"
            f"?month_period={urllib.parse.quote(month_period, safe='')}"
        )
        push_result(http_get(week_url, token, timeout_s))
        push_result(http_get(month_url, token, timeout_s))

    def period_task() -> None:
        weekly_url = f"{base_url}/v1/reports/weekly/all-periods?limit=100"
        monthly_url = f"{base_url}/v1/reports/monthly/all-periods?limit=100"
        push_result(http_get(weekly_url, token, timeout_s))
        push_result(http_get(monthly_url, token, timeout_s))

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = []
        for _ in range(duration_s):
            second_start = time.perf_counter()
            for _ in range(detail_rate):
                futures.append(executor.submit(detail_task))
            for _ in range(period_rate):
                futures.append(executor.submit(period_task))
            elapsed = time.perf_counter() - second_start
            if elapsed < 1.0:
                time.sleep(1.0 - elapsed)

        for future in as_completed(futures):
            _ = future.result()

    return results


def print_summary(summary: LoadSummary) -> None:
    print("=== 报表时间筛选压测结果（Python版）===")
    print(f"总请求数: {summary.total}")
    print(f"成功请求: {summary.success}")
    print(f"失败请求: {summary.failed}")
    print(f"耗时: {summary.duration_s:.2f}s")
    print(f"吞吐: {summary.qps:.2f} req/s")
    print(f"失败率: {summary.fail_rate * 100:.2f}%")
    print(f"延迟: p50={summary.p50:.2f}ms p95={summary.p95:.2f}ms p99={summary.p99:.2f}ms")
    print("")
    print("[分端点指标]")
    for key in sorted(summary.endpoint_stats.keys()):
        metric = summary.endpoint_stats[key]
        print(
            f"- {key}: count={int(metric['count'])}, qps={metric['qps']:.2f}, "
            f"fail_rate={metric['fail_rate'] * 100:.2f}%, p95={metric['p95']:.2f}ms, "
            f"p99={metric['p99']:.2f}ms"
        )


def dump_summary_json(summary: LoadSummary, output_file: Path) -> None:
    payload = {
        "total": summary.total,
        "success": summary.success,
        "failed": summary.failed,
        "duration_s": summary.duration_s,
        "qps": summary.qps,
        "fail_rate": summary.fail_rate,
        "p50_ms": summary.p50,
        "p95_ms": summary.p95,
        "p99_ms": summary.p99,
        "endpoint_stats": summary.endpoint_stats,
    }
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AIOS 报表时间筛选压测（Python版）")
    parser.add_argument("--base-url", default="http://localhost:8000", help="后端地址")
    parser.add_argument("--duration", type=int, default=60, help="压测时长（秒）")
    parser.add_argument("--detail-rate", type=int, default=30, help="每秒 detail 任务数")
    parser.add_argument("--period-rate", type=int, default=10, help="每秒 period 任务数")
    parser.add_argument("--workers", type=int, default=50, help="线程池大小")
    parser.add_argument("--timeout", type=float, default=10.0, help="单请求超时（秒）")
    parser.add_argument(
        "--env-file",
        default="backend-rust/.env",
        help="读取 SECRET_KEY 的 env 文件路径",
    )
    parser.add_argument(
        "--output",
        default=f"/tmp/aios-k6/python-loadtest-{int(time.time())}.json",
        help="结果输出 JSON 路径",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    env_file = Path(args.env_file)
    output_file = Path(args.output)

    secret_key = read_secret_key_from_env_file(env_file)
    token = generate_test_jwt(secret_key)
    base_url = args.base_url.rstrip("/")

    start_prepare = time.perf_counter()
    weekly_periods, monthly_periods = fetch_periods(base_url, token, args.timeout)
    print(
        f"预热完成：weekly_periods={len(weekly_periods)} monthly_periods={len(monthly_periods)} "
        f"(耗时 {(time.perf_counter() - start_prepare):.2f}s)"
    )

    start = time.perf_counter()
    results = run_loadtest(
        base_url=base_url,
        token=token,
        weekly_periods=weekly_periods,
        monthly_periods=monthly_periods,
        duration_s=args.duration,
        detail_rate=args.detail_rate,
        period_rate=args.period_rate,
        workers=args.workers,
        timeout_s=args.timeout,
    )
    elapsed = time.perf_counter() - start

    summary = build_summary(results, elapsed)
    print_summary(summary)
    dump_summary_json(summary, output_file)
    print(f"\n结果文件: {output_file}")


if __name__ == "__main__":
    main()
