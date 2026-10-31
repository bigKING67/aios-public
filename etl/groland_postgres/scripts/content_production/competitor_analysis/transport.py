"""Process-wide storage circuit: one real object probe before resuming all slots."""
import threading
import time


class StorageCircuit:
    def __init__(self, cooldown=60, clock=time.monotonic):
        self.cooldown, self.clock = cooldown, clock
        self.lock = threading.Lock()
        self.key, self.retry_at, self.probing, self.generation = None, 0, False, 0

    def trip(self, key):
        with self.lock:
            opened = self.key is None
            self.key, self.retry_at = key, self.clock() + self.cooldown
            self.generation += 1
        if opened:
            print('[competitor-link] storage unavailable; pausing new claims', flush=True)

    def allowed(self, storage):
        with self.lock:
            if self.key is None:
                return True
            if self.probing or self.clock() < self.retry_at:
                return False
            key, generation = self.key, self.generation
            self.probing = True
        try:
            # Authenticated HEAD. A genuine 404 also proves transport is back; the job
            # still validates its required source separately and cannot publish without it.
            storage.object_exists(key)
            healthy = True
        except Exception:
            healthy = False
        with self.lock:
            self.probing = False
            if generation != self.generation:
                return False
            if healthy:
                self.key = None
            else:
                self.retry_at = self.clock() + self.cooldown
        if healthy:
            print('[competitor-link] authenticated storage probe recovered; resuming claims', flush=True)
        return healthy
