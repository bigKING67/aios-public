#!/usr/bin/env node

import { CdpClient, ensureCdpWebSocketRuntime } from '../../lib/frontend/smoke/chrome-cdp-client.mjs';
import { launchChrome } from '../../lib/frontend/smoke/chrome-cdp-launcher.mjs';
import {
  DEFAULT_ROUTE_SETTLE_POLL_MS,
  DEFAULT_TIMEOUT_MS,
} from '../../lib/frontend/smoke/constants.mjs';
import {
  buildRouteUrl,
  normalizeBaseUrl,
  parseIntegerEnv,
  readSmokeCookiesFromEnv,
} from '../../lib/frontend/smoke/config.mjs';
import { fetchWithTimeout, sleep } from '../../lib/frontend/smoke/http.mjs';

const CONTENT_ASSETS_ROUTE = '/marketing/content-assets';
const CONTENT_ASSETS_VIEWPORTS = Object.freeze([
  { name: 'desktop', width: 1365, height: 900, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
]);
const DEFAULT_CONTENT_ASSETS_SETTLE_TIMEOUT_MS = 20_000;

function fail(message, failures) {
  failures.push(message);
}

async function evaluate(client, sessionId, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed.');
  }
  return result.result?.value;
}

async function waitForPageReady(client, sessionId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await evaluate(client, sessionId, `(() => {
      const text = document.body?.innerText || '';
      return text.includes('上传素材') && text.includes('进入素材库') && text.includes('总素材');
    })()`);
    if (ready) return;
    await sleep(DEFAULT_ROUTE_SETTLE_POLL_MS);
  }
  throw new Error('Timed out waiting for content-assets page text.');
}

async function clickByText(client, sessionId, text) {
  return evaluate(client, sessionId, `(() => {
    const target = [...document.querySelectorAll('button,a,[role="button"]')]
      .find((element) => (element.innerText || element.getAttribute('aria-label') || '').includes(${JSON.stringify(text)}));
    if (!target) return false;
    target.click();
    return true;
  })()`);
}

async function pressEscape(client, sessionId) {
  await client.send('Input.dispatchKeyEvent', {
    code: 'Escape',
    key: 'Escape',
    type: 'keyDown',
    windowsVirtualKeyCode: 27,
  }, sessionId);
  await client.send('Input.dispatchKeyEvent', {
    code: 'Escape',
    key: 'Escape',
    type: 'keyUp',
    windowsVirtualKeyCode: 27,
  }, sessionId);
}

async function capturePageState(client, sessionId) {
  return evaluate(client, sessionId, `(() => {
    const text = document.body?.innerText || '';
    const documentElement = document.documentElement;
    const dialogs = [...document.querySelectorAll('[role="dialog"], .ant-modal, .ant-drawer')];
    const moduleRailText = document.querySelector('[aria-label="素材库导航"]')?.innerText || '';
    const contentShellText = document.querySelector('[class*="consoleShell"]')?.innerText || '';
    const contentHubNavText = [...document.querySelectorAll('.header-nav-menu')]
      .map((element) => element.innerText || '')
      .join('\\n');
    return {
      path: location.pathname,
      search: location.search,
      textLen: text.length,
      hasMaterialLibraryNav: text.includes('素材库'),
      hasContentHubTopNav: contentHubNavText.includes('内容中台'),
      hasLegacyContentHubInContentAssets:
        moduleRailText.includes('内容中台') || contentShellText.includes('内容中台'),
      hasBrandHomeLink: Boolean(
        document.querySelector('[aria-label="素材库导航"] a[aria-label="返回首页"][href="/"]')
      ),
      hasWorkbench: text.includes('核心工作台'),
      hasUpload: text.includes('上传素材'),
      hasLibraryEntry: text.includes('进入素材库'),
      hasTotalAsset: text.includes('总素材'),
      hasLibrary: text.includes('素材库') || text.includes('素材筛选') || text.includes('资产状态'),
      hasFilter: text.includes('素材筛选') || text.includes('负责人') || text.includes('资产状态'),
      hasAiInspector: text.includes('AI分析') || text.includes('AI 分析') || text.includes('分析任务'),
      hasProcessingJobs: text.includes('处理任务') || text.includes('视频处理') || text.includes('AI分析'),
      hasMatchingPanel: text.includes('回流匹配') || text.includes('绑定日报记录') || text.includes('待绑定视频 ID'),
      dialogText: dialogs.map((dialog) => dialog.innerText || '').join('\\n').slice(0, 1200),
      overflowX: documentElement.scrollWidth > documentElement.clientWidth + 1,
      scrollWidth: documentElement.scrollWidth,
      clientWidth: documentElement.clientWidth,
      errors: window.__contentAssetsSmokeErrors || [],
      consoleErrors: window.__contentAssetsSmokeConsoleErrors || [],
    };
  })()`);
}

async function maybeCheckDetailSurface(client, sessionId) {
  const opened = await evaluate(client, sessionId, `(() => {
    const target = document.querySelector('[aria-label^="打开素材详情"]');
    if (!target) return false;
    target.click();
    return true;
  })()`);
  if (!opened) {
    return { status: 'skipped:no-assets' };
  }

  await sleep(1000);
  const detailState = await capturePageState(client, sessionId);
  const profileClicked = await clickByText(client, sessionId, '编辑档案');
  await sleep(500);
  const profileState = await capturePageState(client, sessionId);
  await pressEscape(client, sessionId);
  await sleep(300);

  const identityTabClicked = await clickByText(client, sessionId, '身份/投放映射');
  await sleep(500);
  const identityState = await capturePageState(client, sessionId);

  return {
    status: 'checked',
    detailPath: detailState.path,
    hasDetailProfileAction: detailState.hasUpload || detailState.dialogText.includes('编辑档案') || profileClicked,
    profileModalOpened: profileClicked && profileState.dialogText.includes('保存档案'),
    identityTabClicked,
    identityVisible: identityState.textLen > 0 && (
      identityState.dialogText.includes('平台身份') ||
      identityState.dialogText.includes('素材实例') ||
      identityState.hasMatchingPanel ||
      identityState.hasProcessingJobs
    ),
  };
}

async function createContentAssetsTarget({ baseUrl, client, cookies, timeoutMs, viewport }) {
  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });

  await client.send('Network.enable', {}, sessionId);
  for (const cookie of cookies) {
    const result = await client.send('Network.setCookie', {
      name: cookie.name,
      url: baseUrl,
      value: cookie.value,
    }, sessionId);
    if (result.success !== true) {
      throw new Error(`Failed to install content-assets browser smoke cookie ${cookie.name}.`);
    }
  }
  await client.send('Page.enable', {}, sessionId);
  await client.send('Runtime.enable', {}, sessionId);
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__contentAssetsSmokeErrors = [];
      window.__contentAssetsSmokeConsoleErrors = [];
      window.addEventListener('error', (event) => {
        window.__contentAssetsSmokeErrors.push(event.message || 'window error');
      });
      window.addEventListener('unhandledrejection', (event) => {
        window.__contentAssetsSmokeErrors.push(String(event.reason || 'unhandled rejection'));
      });
      const originalConsoleError = console.error;
      console.error = (...args) => {
        window.__contentAssetsSmokeConsoleErrors.push(args.map((arg) => {
          if (typeof arg === 'string') return arg;
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }).join(' '));
        originalConsoleError.apply(console, args);
      };
    `,
  }, sessionId);
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.mobile ? 3 : 1,
    mobile: viewport.mobile,
  }, sessionId);

  const targetUrl = buildRouteUrl(baseUrl, CONTENT_ASSETS_ROUTE);
  const documentResponse = await fetchWithTimeout(targetUrl, timeoutMs, {
    headers: cookies.length
      ? { Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ') }
      : undefined,
  });
  const loadWaiter = client.waitForEvent('Page.loadEventFired', sessionId, timeoutMs);
  const navigation = await client.send('Page.navigate', { url: targetUrl }, sessionId);
  if (navigation.errorText) {
    throw new Error(`${viewport.name}: navigation failed: ${navigation.errorText}`);
  }
  await loadWaiter;

  return {
    documentStatus: documentResponse.status,
    sessionId,
    targetId,
  };
}

export async function runContentAssetsBrowserSmoke({
  baseUrl = normalizeBaseUrl(process.env.FRONTEND_SMOKE_BASE_URL),
  cookies = readSmokeCookiesFromEnv(),
  requireAuthCookies = process.env.CONTENT_ASSETS_BROWSER_SMOKE_REQUIRE_AUTH !== '0',
  settleTimeoutMs = parseIntegerEnv('CONTENT_ASSETS_BROWSER_SMOKE_SETTLE_TIMEOUT_MS', DEFAULT_CONTENT_ASSETS_SETTLE_TIMEOUT_MS),
  timeoutMs = parseIntegerEnv('CONTENT_ASSETS_BROWSER_SMOKE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
  viewports = CONTENT_ASSETS_VIEWPORTS,
} = {}) {
  ensureCdpWebSocketRuntime();
  const authState = cookies.length > 0
    ? 'authenticated cookie header provided'
    : requireAuthCookies
      ? 'missing authenticated smoke cookies'
      : 'anonymous redirect allowed';

  if (requireAuthCookies && cookies.length === 0) {
    return {
      authState,
      baseUrl,
      engine: 'chrome-cdp (not launched: missing authenticated smoke cookies)',
      failures: [
        [
          'Content-assets browser smoke requires authenticated browser state for the protected route.',
          'Provide FRONTEND_SMOKE_COOKIE_HEADER="aios_access_token=...; aios_refresh_token=..."',
          'or set CONTENT_ASSETS_BROWSER_SMOKE_REQUIRE_AUTH=0 only when intentionally checking anonymous redirects.',
        ].join(' '),
      ],
      results: [],
    };
  }

  const chrome = await launchChrome();
  const client = new CdpClient(chrome.wsUrl);
  const failures = [];
  const results = [];

  try {
    await client.connect();
    for (const viewport of viewports) {
      const target = await createContentAssetsTarget({
        baseUrl,
        client,
        cookies,
        timeoutMs,
        viewport,
      });
      try {
        await waitForPageReady(client, target.sessionId, settleTimeoutMs);
        const initial = await capturePageState(client, target.sessionId);
        const uploadClicked = await clickByText(client, target.sessionId, '上传素材');
        await sleep(500);
        const uploadModal = await capturePageState(client, target.sessionId);
        await pressEscape(client, target.sessionId);
        await sleep(300);

        const libraryClicked = await clickByText(client, target.sessionId, '进入素材库');
        await sleep(900);
        const library = await capturePageState(client, target.sessionId);

        const advancedClicked = await clickByText(client, target.sessionId, '高级筛选');
        await sleep(500);
        const advancedFilter = await capturePageState(client, target.sessionId);
        await pressEscape(client, target.sessionId);
        await sleep(300);

        const detail = await maybeCheckDetailSurface(client, target.sessionId);
        const finalState = await capturePageState(client, target.sessionId);

        const viewportResult = {
          viewport: viewport.name,
          documentStatus: target.documentStatus,
          initial,
          uploadModalOpened: uploadClicked && uploadModal.dialogText.includes('上传视频素材'),
          libraryClicked,
          library,
          advancedFilterOpened: advancedClicked && advancedFilter.dialogText.includes('高级筛选'),
          detail,
          finalState,
        };
        results.push(viewportResult);

        if (target.documentStatus !== 200) {
          fail(`${viewport.name}: expected document status 200, got ${target.documentStatus}.`, failures);
        }
        if (initial.path !== CONTENT_ASSETS_ROUTE) {
          fail(`${viewport.name}: expected final path ${CONTENT_ASSETS_ROUTE}, got ${initial.path}.`, failures);
        }
        if (!initial.hasUpload || !initial.hasLibraryEntry || !initial.hasTotalAsset) {
          fail(`${viewport.name}: missing content-assets shell actions or summary text.`, failures);
        }
        if (
          !initial.hasMaterialLibraryNav ||
          initial.hasLegacyContentHubInContentAssets ||
          !initial.hasBrandHomeLink
        ) {
          fail(
            `${viewport.name}: content hub/material library navigation contract was not satisfied.`,
            failures,
          );
        }
        if (!viewportResult.uploadModalOpened) {
          fail(`${viewport.name}: upload modal did not open.`, failures);
        }
        if (!libraryClicked || !library.hasLibrary || !library.hasFilter) {
          fail(`${viewport.name}: library panel or filters did not become visible.`, failures);
        }
        if (!viewportResult.advancedFilterOpened) {
          fail(`${viewport.name}: advanced filter drawer did not open.`, failures);
        }
        if (initial.overflowX || library.overflowX || finalState.overflowX) {
          fail(`${viewport.name}: horizontal overflow detected.`, failures);
        }
        if (detail.status === 'checked' && (!detail.profileModalOpened || !detail.identityTabClicked)) {
          fail(`${viewport.name}: detail profile or identity interaction did not verify.`, failures);
        }
        const errors = [
          ...initial.errors,
          ...initial.consoleErrors,
          ...library.errors,
          ...library.consoleErrors,
          ...finalState.errors,
          ...finalState.consoleErrors,
        ];
        if (errors.length > 0) {
          fail(`${viewport.name}: runtime or console errors detected: ${errors.join(' | ')}`, failures);
        }
      } finally {
        await client.send('Target.closeTarget', { targetId: target.targetId });
      }
    }
  } finally {
    client.close();
    await chrome.cleanup();
  }

  return {
    authState,
    baseUrl,
    engine: `chrome-cdp (${chrome.executable})`,
    failures,
    results,
  };
}

export function printContentAssetsBrowserSmokeSummary(result) {
  console.log(`[content-assets-browser-smoke] base_url=${result.baseUrl}`);
  console.log(`[content-assets-browser-smoke] engine=${result.engine}`);
  console.log(`[content-assets-browser-smoke] auth_state=${result.authState}`);
  console.log(`[content-assets-browser-smoke] checked=${result.results.length}`);
  for (const item of result.results) {
    console.log(
      [
        `[content-assets-browser-smoke] ${item.viewport}`,
        `status=${item.documentStatus}`,
        `upload_modal=${item.uploadModalOpened ? 'yes' : 'no'}`,
        `library=${item.library.hasLibrary ? 'yes' : 'no'}`,
        `advanced_filter=${item.advancedFilterOpened ? 'yes' : 'no'}`,
        `detail=${item.detail.status}`,
        `overflow=${item.initial.overflowX || item.library.overflowX || item.finalState.overflowX ? 'yes' : 'no'}`,
        `console_errors=${[
          ...item.initial.consoleErrors,
          ...item.library.consoleErrors,
          ...item.finalState.consoleErrors,
        ].length}`,
      ].join(' ')
    );
  }
  if (result.failures.length > 0) {
    for (const failure of result.failures) {
      console.error(`[content-assets-browser-smoke] ${failure}`);
    }
    return;
  }
  console.log('[content-assets-browser-smoke] passed');
}

try {
  const result = await runContentAssetsBrowserSmoke();
  printContentAssetsBrowserSmokeSummary(result);
  if (result.failures.length > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[content-assets-browser-smoke] failed to run: ${detail}`);
  process.exitCode = 1;
}
