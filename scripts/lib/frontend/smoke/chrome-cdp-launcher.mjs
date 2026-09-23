import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  STARTUP_TIMEOUT_MS,
} from './constants.mjs';

export function findChromeExecutable() {
  const candidates = [
    process.env.FRONTEND_SMOKE_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/opt/google/chrome/chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export async function launchChrome() {
  const executable = findChromeExecutable();
  if (!executable) {
    throw new Error(
      [
        'Browser automation is unavailable: Playwright is not installed and Chrome/Chromium was not found.',
        '',
        'Use one of these options, then rerun:',
        '  1) Install Playwright intentionally: npm install -D playwright',
        '  2) Install Chrome/Chromium locally',
        '  3) Point to an existing browser:',
        '     FRONTEND_SMOKE_CHROME_PATH=/path/to/chrome npm run test:frontend:smoke',
        '',
        'This script does not npm install dependencies automatically.',
      ].join('\n'),
    );
  }

  const userDataDir = await mkdtemp(path.join(tmpdir(), 'aios-frontend-smoke-'));
  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-gpu',
    '--disable-popup-blocking',
    '--no-default-browser-check',
    '--no-first-run',
    'about:blank',
  ];
  const child = spawn(executable, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const wsUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for Chrome DevTools websocket.'));
    }, STARTUP_TIMEOUT_MS);

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      const match = chunk.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited before DevTools was ready (code ${code}).`));
    });
  });

  return {
    child,
    executable,
    userDataDir,
    async cleanup() {
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1_000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      await rm(userDataDir, { recursive: true, force: true });
    },
    wsUrl,
  };
}
