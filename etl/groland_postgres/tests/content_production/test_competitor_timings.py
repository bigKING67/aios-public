import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.competitor_analysis import offline, worker
from content_production.stage_timings import StageTimings


@pytest.mark.parametrize('status,attempts', [('500', 1), ('429', 4)])
def test_cloud_timings_preserve_bounded_failure_and_count_backoff(tmp_path, monkeypatch, status, attempts):
    source = tmp_path / 'source.mp4'
    source.write_bytes(b'offline-fixture-never-uploaded')
    monkeypatch.setattr(offline, 'probe', lambda _: (20.0, 'available'))
    monkeypatch.setattr(offline, 'ffmpeg', lambda *_: source)
    backoff = Mock()
    monkeypatch.setattr(offline.time, 'sleep', backoff)
    post = Mock(side_effect=RuntimeError(f'HTTP {status}'))
    timings = StageTimings()
    record = offline.analyze('fixture', source, tmp_path, worker.SETTINGS, SimpleNamespace(_post=post), timings=timings)
    assert record['status'] == 'provider_error'
    assert post.call_count == attempts
    assert backoff.call_count == attempts - 1
    stages = timings.snapshot('before_result_write')['stages']
    assert stages['card_cloud_request']['calls'] == attempts
    assert stages['card_cloud_request']['failures'] == attempts
    assert stages['card_cloud_total']['calls'] == 1
    assert stages['card_proxy']['calls'] == stages['card_hook']['calls'] == 1
    assert ('card_cloud_backoff' in stages) == (attempts > 1)
    assert 'performance' not in record['input_manifest']
