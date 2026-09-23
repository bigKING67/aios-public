import {
  DEFAULT_ROUTE_SETTLE_POLL_MS,
} from './constants.mjs';
import { sleep } from './http.mjs';
import {
  capturePageSnapshot,
  evaluateSnapshot,
  hasSettleSensitiveFailure,
} from './snapshot.mjs';

async function captureCdpPageState(client, sessionId, routeExpectation) {
  const expression = `(${capturePageSnapshot.toString()})(${JSON.stringify(routeExpectation.expectedCssVariables)})`;
  const evaluated = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  const snapshot = evaluated.result?.value;

  const pageErrorsResult = await client.send('Runtime.evaluate', {
    expression: 'window.__frontendSmokeErrors || []',
    returnByValue: true,
  }, sessionId);
  const pageErrors = Array.isArray(pageErrorsResult.result?.value)
    ? pageErrorsResult.result.value
    : [];

  const consoleErrorsResult = await client.send('Runtime.evaluate', {
    expression: 'window.__frontendSmokeConsoleErrors || []',
    returnByValue: true,
  }, sessionId);
  const consoleErrors = Array.isArray(consoleErrorsResult.result?.value)
    ? consoleErrorsResult.result.value
    : [];

  return { consoleErrors, pageErrors, snapshot };
}

export async function waitForCdpSnapshot({
  client,
  documentStatus,
  routeExpectation,
  sessionId,
  settleTimeoutMs,
  viewport,
}) {
  const deadline = Date.now() + settleTimeoutMs;
  let state = await captureCdpPageState(client, sessionId, routeExpectation);
  let failures = state.snapshot
    ? evaluateSnapshot({
      routeExpectation,
      viewport,
      status: documentStatus,
      consoleErrors: state.consoleErrors,
      pageErrors: state.pageErrors,
      snapshot: state.snapshot,
    })
    : [`${viewport.name} ${routeExpectation.path}: failed to capture browser snapshot.`];

  while (hasSettleSensitiveFailure(failures) && Date.now() < deadline) {
    await sleep(DEFAULT_ROUTE_SETTLE_POLL_MS);
    state = await captureCdpPageState(client, sessionId, routeExpectation);
    failures = state.snapshot
      ? evaluateSnapshot({
        routeExpectation,
        viewport,
        status: documentStatus,
        consoleErrors: state.consoleErrors,
        pageErrors: state.pageErrors,
        snapshot: state.snapshot,
      })
      : [`${viewport.name} ${routeExpectation.path}: failed to capture browser snapshot.`];
  }

  return {
    consoleErrors: state.consoleErrors,
    failures,
    pageErrors: state.pageErrors,
    snapshot: state.snapshot,
  };
}
