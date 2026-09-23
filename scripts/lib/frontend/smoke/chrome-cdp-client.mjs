import {
  STARTUP_TIMEOUT_MS,
} from './constants.mjs';

export function ensureCdpWebSocketRuntime() {
  if (typeof WebSocket !== 'function') {
    throw new Error(
      [
        'Chrome CDP smoke fallback requires a Node runtime with global WebSocket.',
        'Use Node with global WebSocket support, install Playwright intentionally, or set FRONTEND_SMOKE_CHROME_PATH in a supported runtime.',
      ].join(' '),
    );
  }
}

export class CdpClient {
  constructor(wsUrl) {
    ensureCdpWebSocketRuntime();

    this.id = 0;
    this.pending = new Map();
    this.waiters = [];
    this.ws = new WebSocket(wsUrl);
  }

  async connect() {
    if (this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out connecting to Chrome DevTools websocket.'));
      }, STARTUP_TIMEOUT_MS);
      const cleanup = () => {
        clearTimeout(timer);
        this.ws.removeEventListener('open', onOpen);
        this.ws.removeEventListener('error', onError);
      };
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Failed to connect to Chrome DevTools websocket.'));
      };
      this.ws.addEventListener('open', onOpen, { once: true });
      this.ws.addEventListener('error', onError, { once: true });
    });

    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(message.error.message || JSON.stringify(message.error)));
        } else {
          resolve(message.result ?? {});
        }
        return;
      }

      for (const waiter of [...this.waiters]) {
        if (
          waiter.method === message.method &&
          (!waiter.sessionId || waiter.sessionId === message.sessionId)
        ) {
          waiter.resolve(message);
          this.waiters = this.waiters.filter((item) => item !== waiter);
        }
      }
    });
  }

  send(method, params = {}, sessionId = undefined) {
    const id = ++this.id;
    const payload = sessionId
      ? { id, method, params, sessionId }
      : { id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  waitForEvent(method, sessionId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const waiter = { method, sessionId, resolve, reject };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((item) => item !== waiter);
        reject(new Error(`Timed out waiting for CDP event ${method}.`));
      }, timeoutMs);
      waiter.resolve = (message) => {
        clearTimeout(timer);
        resolve(message);
      };
      this.waiters.push(waiter);
    });
  }

  close() {
    this.ws.close();
  }
}
