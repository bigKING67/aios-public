import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import psycopg2
from psycopg2 import extensions
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.competitor_analysis.connections import ConnectionPool


class Connection:
    def __init__(self):
        self.closed = False
        self.status = extensions.TRANSACTION_STATUS_IDLE
        self.rollbacks = 0

    def get_transaction_status(self):
        return self.status

    def rollback(self):
        self.rollbacks += 1
        self.status = extensions.TRANSACTION_STATUS_IDLE

    def close(self):
        self.closed = True


@pytest.mark.parametrize('status', [extensions.TRANSACTION_STATUS_INTRANS, extensions.TRANSACTION_STATUS_INERROR])
def test_reuses_one_lazy_connection_and_rolls_back_unfinished_transactions(status):
    opened = []
    def factory():
        opened.append(Connection())
        return opened[-1]
    pool = ConnectionPool(factory=factory)
    assert not opened
    with pool.connection() as first:
        first.status = status
    with pool.connection() as second:
        assert second is first
        assert second.status == extensions.TRANSACTION_STATUS_IDLE
    assert len(opened) == 1 and first.rollbacks == 1
    pool.close()
    assert first.closed


def test_pool_caps_concurrent_borrows_and_times_out_without_opening_more():
    opened = []
    def factory():
        opened.append(Connection())
        return opened[-1]
    pool = ConnectionPool(2, factory=factory, wait_seconds=.05)
    barrier, release = threading.Barrier(3, timeout=3), threading.Event()
    def hold():
        with pool.connection():
            barrier.wait()
            assert release.wait(3)
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(hold) for _ in range(2)]
        try:
            barrier.wait()
            with pytest.raises(psycopg2.OperationalError, match='wait timed out'):
                with pool.connection():
                    pytest.fail('pool exceeded capacity')
            assert len(opened) == 2
        finally:
            release.set()
        for f in futures:
            f.result()
    with pool.connection():
        assert len(opened) == 2
    pool.close()


def test_unknown_commit_failure_discards_connection_without_replaying_work():
    opened, writes = [], []
    def factory():
        opened.append(Connection())
        return opened[-1]
    pool = ConnectionPool(1, factory=factory)
    with pytest.raises(psycopg2.OperationalError):
        with pool.connection():
            writes.append('possibly committed')
            raise psycopg2.OperationalError('lost acknowledgement')
    assert opened[0].closed and len(writes) == 1
    with pool.connection() as conn:
        assert conn is opened[1]
    pool.close()


def test_connect_failure_does_not_consume_pool_capacity():
    calls = []
    def factory():
        calls.append(1)
        if len(calls) == 1:
            raise psycopg2.OperationalError('offline')
        return Connection()
    pool = ConnectionPool(1, factory=factory)
    with pytest.raises(psycopg2.OperationalError):
        with pool.connection():
            pytest.fail('offline')
    with pool.connection():
        assert len(calls) == 2
    pool.close()


def test_rollback_failure_discards_connection_without_hiding_caller_error():
    broken = Connection()
    def rollback():
        raise psycopg2.OperationalError('private credentials must not be logged')
    broken.rollback = rollback
    pool = ConnectionPool(1, factory=lambda: broken)
    with pytest.raises(ValueError, match='caller failed'):
        with pool.connection() as conn:
            conn.status = extensions.TRANSACTION_STATUS_INERROR
            raise ValueError('caller failed')
    assert broken.closed
    pool.close()


def test_idle_expiry_reconnects_and_closed_pool_rejects_borrowers():
    pool = ConnectionPool(1, factory=Connection, idle_seconds=0)
    with pool.connection() as first:
        pass
    with pool.connection() as second:
        assert first.closed and second is not first
        pool.close()
    assert second.closed
    with pytest.raises(psycopg2.OperationalError, match='pool is closed'):
        with pool.connection():
            pytest.fail('closed')


@pytest.mark.skipif(not os.getenv('COMPETITOR_TEST_DATABASE_URL'), reason='isolated fixture required')
def test_real_postgres_reuse_transaction_isolation_and_dead_connection_recovery(monkeypatch):
    dsn = os.environ['COMPETITOR_TEST_DATABASE_URL']
    monkeypatch.setenv('DATABASE_URL', dsn)
    pool = ConnectionPool(1)
    try:
        with pool.connection() as conn:
            pid = conn.get_backend_pid()
            with conn.cursor() as cur:
                cur.execute('CREATE TEMP TABLE pool_regression (id INTEGER PRIMARY KEY)')
                cur.execute('INSERT INTO pool_regression VALUES (1)')
            conn.commit()
        with pool.connection() as conn:
            assert conn.get_backend_pid() == pid
            with conn.cursor() as cur:
                cur.execute('INSERT INTO pool_regression VALUES (2)')
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT id FROM pool_regression ORDER BY id')
                assert cur.fetchall() == [(1,)]
        with pytest.raises(psycopg2.errors.UniqueViolation):
            with pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute('INSERT INTO pool_regression VALUES (1)')
        with psycopg2.connect(dsn) as killer:
            with killer.cursor() as cur:
                cur.execute('SELECT pg_terminate_backend(%s)', (pid,))
                assert cur.fetchone()[0]
        with pytest.raises(psycopg2.OperationalError):
            with pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute('SELECT 1')
        with pool.connection() as conn:
            assert conn.get_backend_pid() != pid
            with conn.cursor() as cur:
                cur.execute('SELECT 1')
                assert cur.fetchone() == (1,)
    finally:
        pool.close()
