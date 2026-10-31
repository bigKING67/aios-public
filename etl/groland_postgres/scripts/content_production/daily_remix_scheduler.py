"""Drive the Rust daily planner; the API owns combinations, quotas and writes."""
import os
import time
from datetime import datetime
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

import requests


def beijing_date():
    return datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat()


def configuration():
    if os.getenv("CONTENT_AI_STUDIO_DAILY_REMIX_ENABLED") != "true":
        return None
    base = os.getenv("CONTENT_AI_STUDIO_DAILY_REMIX_API_URL", "http://127.0.0.1:8000").rstrip("/")
    parsed = urlsplit(base)
    if (parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username
            or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}):
        raise ValueError("daily remix API URL must be a base URL without credentials")
    if parsed.scheme == "http" and parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("daily remix API requires HTTPS outside loopback")
    token = os.getenv("CONTENT_AI_STUDIO_DAILY_REMIX_TOKEN", "")
    if len(token) < 32:
        raise ValueError("daily remix service token is not configured")
    return base, token


def dispatch_once(session, base, token, date):
    # No redirect can forward the service credential. No generic HTTP retry:
    # a bounded next poll safely resumes the same database-owned daily plan.
    response = session.post(base + "/v2/marketing/content-assets/studio/daily-remix:run",
                            headers={"Authorization": "Bearer " + token},
                            json={"date": date}, timeout=(10, 180), allow_redirects=False)
    if response.status_code != 200:
        # Do not log server bodies, URLs, request headers or secret configuration.
        raise RuntimeError(f"daily remix API returned HTTP {response.status_code}")
    data = response.json()
    if not isinstance(data, dict) or data.get("date") != date or data.get("status") not in {
            "not_started", "paused", "waiting_sources", "over_budget", "running", "done"}:
        raise RuntimeError("invalid daily remix API response")
    return data


def run_day(call, *, date, logger, sleep=time.sleep, current_date=beijing_date, max_polls=720):
    last = {"date": date, "status": "not_started"}
    failures = 0
    for _ in range(max_polls):
        if current_date() != date:
            return {**last, "schedulerStop": "day_changed"}
        try:
            last = call(date)
        except (requests.Timeout, requests.ConnectionError):
            failures += 1
            if failures >= 3:
                raise RuntimeError("daily remix API unavailable after three polls") from None
            logger.warning("Daily remix API unavailable; next poll resumes the same date")
            sleep(60)
            continue
        failures = 0
        logger.info("Daily remix %s: status=%s planned=%s active=%s succeeded=%s failed=%s",
                    date, last["status"], last.get("plannedCount"), last.get("activeCount"),
                    last.get("succeededCount"), last.get("failedCount"))
        if last["status"] in {"done", "over_budget"}:
            return last
        # Paused plans keep polling so an operator can resume the same day.
        sleep(60)
    return {**last, "schedulerStop": "poll_limit"}


def execute(logger):
    config = configuration()
    if config is None:
        return {"status": "disabled"}
    base, token = config
    date = beijing_date()
    with requests.Session() as session:
        return run_day(lambda day: dispatch_once(session, base, token, day), date=date, logger=logger)
