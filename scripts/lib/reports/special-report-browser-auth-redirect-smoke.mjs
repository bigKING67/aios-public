import { DEFAULT_ROUTE_SETTLE_POLL_MS } from '../frontend/smoke/constants.mjs';
import { sleep } from '../frontend/smoke/http.mjs';

function captureAnonymousRedirectSnapshot() {
  return {
    finalPath: globalThis.location.pathname,
    finalSearch: globalThis.location.search,
  };
}

export function expectedAnonymousRedirectTarget(routePath) {
  return new URL(routePath, 'http://aios.local').pathname;
}

export function isAnonymousRedirectReady(snapshot, route) {
  if (!snapshot || snapshot.finalPath !== '/login') {
    return false;
  }
  const redirectTarget = new URLSearchParams(snapshot.finalSearch).get('redirect');
  return redirectTarget === expectedAnonymousRedirectTarget(route.path);
}

export function buildAnonymousRedirectFailures({ documentStatus, route, snapshot, viewport }) {
  const prefix = `${viewport.name}px ${route.name} ${route.path}`;
  if (!snapshot) {
    return [`${prefix}: failed to capture anonymous redirect location.`];
  }

  const failures = [];
  const expectedRedirect = expectedAnonymousRedirectTarget(route.path);
  const actualRedirect = new URLSearchParams(snapshot.finalSearch).get('redirect');
  if (documentStatus < 200 || documentStatus >= 400) {
    failures.push(`${prefix}: document request returned HTTP ${documentStatus}.`);
  }
  if (snapshot.finalPath !== '/login') {
    failures.push(`${prefix}: expected anonymous final path /login, got ${snapshot.finalPath || '<empty>'}.`);
  }
  if (actualRedirect !== expectedRedirect) {
    failures.push(`${prefix}: expected login redirect target ${expectedRedirect}, got ${actualRedirect || '<empty>'}.`);
  }
  return failures;
}

async function evaluateAnonymousRedirectSnapshot(client, sessionId) {
  const evaluated = await client.send('Runtime.evaluate', {
    expression: `(${captureAnonymousRedirectSnapshot.toString()})()`,
    returnByValue: true,
  }, sessionId);
  return evaluated.result?.value ?? null;
}

export async function waitForAnonymousRedirectSnapshot({
  client,
  documentStatus,
  route,
  sessionId,
  settleTimeoutMs,
  viewport,
}) {
  const deadline = Date.now() + settleTimeoutMs;
  let snapshot = await evaluateAnonymousRedirectSnapshot(client, sessionId);
  while (!isAnonymousRedirectReady(snapshot, route) && Date.now() < deadline) {
    await sleep(DEFAULT_ROUTE_SETTLE_POLL_MS);
    snapshot = await evaluateAnonymousRedirectSnapshot(client, sessionId);
  }
  return {
    failures: buildAnonymousRedirectFailures({ documentStatus, route, snapshot, viewport }),
    snapshot,
  };
}
