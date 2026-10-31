"""Competitor-only bounded connection reuse. Never commit or replay a caller's SQL."""
import atexit
from contextlib import contextmanager
import logging
import os
import queue
import threading
import time

import psycopg2
from psycopg2 import extensions

from marketing_content_assets.repository import open_pg_connection

LOG = logging.getLogger(__name__)


class ConnectionPool:
    def __init__(self, size=4, *, factory=None, wait_seconds=5, idle_seconds=300):
        if not 1 <= size <= 8:
            raise ValueError('COMPETITOR_DB_POOL_SIZE must be between 1 and 8')
        self._slots = queue.LifoQueue(maxsize=size)
        for _ in range(size):
            self._slots.put(None)
        self._factory = factory or (lambda: open_pg_connection(
            connect_timeout=8, keepalives=1, keepalives_idle=30,
            keepalives_interval=10, keepalives_count=3, tcp_user_timeout=60000))
        self._wait_seconds, self._idle_seconds = wait_seconds, idle_seconds
        self._closed = False

    @contextmanager
    def connection(self):
        if self._closed:
            raise psycopg2.OperationalError('competitor connection pool is closed')
        try:
            entry = self._slots.get(timeout=self._wait_seconds)
        except queue.Empty:
            raise psycopg2.OperationalError('competitor database pool wait timed out') from None
        conn, broken = None, False
        try:
            if entry is not None:
                conn, returned_at = entry
                if conn.closed or time.monotonic() - returned_at >= self._idle_seconds:
                    conn.close()
                    conn = None
            if self._closed:
                raise psycopg2.OperationalError('competitor connection pool is closed')
            if conn is None:
                conn = self._factory()
            yield conn
        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            # Even a lost COMMIT acknowledgement must not replay business writes.
            broken = True
            raise
        finally:
            keep = conn is not None and not broken and not self._closed and not conn.closed
            if keep:
                try:
                    status = conn.get_transaction_status()
                    if status in (extensions.TRANSACTION_STATUS_INTRANS, extensions.TRANSACTION_STATUS_INERROR):
                        conn.rollback()
                    keep = conn.get_transaction_status() == extensions.TRANSACTION_STATUS_IDLE
                except psycopg2.Error:
                    LOG.warning('competitor database connection discarded during cleanup')
                    keep = False
            if conn is not None and not keep:
                conn.close()
            self._slots.put_nowait((conn, time.monotonic()) if keep else None)

    def close(self):
        """Close idle connections; borrowed ones close on return. Waiting callers fail boundedly."""
        self._closed = True
        entries = []
        while True:
            try:
                entries.append(self._slots.get_nowait())
            except queue.Empty:
                break
        for entry in entries:
            if entry is not None:
                entry[0].close()
        for _ in entries:
            self._slots.put_nowait(None)


_pool = None
_pool_lock = threading.Lock()


def connect_pg():
    global _pool
    with _pool_lock:
        if _pool is None:
            size = int(os.getenv('COMPETITOR_DB_POOL_SIZE', '4'))
            _pool = ConnectionPool(size)
            atexit.register(_pool.close)
    return _pool.connection()
