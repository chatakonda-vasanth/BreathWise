/**
 * Lighthouse runner for local evidence and CI.
 *
 * Lighthouse normally launches its own Chrome, which crashes in this sandbox.
 * Playwright's full Chromium binary runs here, so this script launches that
 * browser with a CDP endpoint and points Lighthouse at it with --port.
 *
 * The sandbox also needs the bundled shared libraries, so run it with:
 *   LD_LIBRARY_PATH="$HOME/.local/pw-libs/usr/lib/x86_64-linux-gnu" \
 *   FONTCONFIG_FILE="$HOME/.local/pw-libs/fonts.conf" \
 *   node scripts/lighthouse.mjs [url] [outputPrefix]
 *
 * Lighthouse is fetched with npx (pinned) instead of being a dependency, so the
 * shipped lockfile keeps its zero-advisory audit result.
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://127.0.0.1:3110/';
const output = process.argv[3] ?? 'lighthouse-report';
const port = 9223;
const LIGHTHOUSE_VERSION = '12.8.2';
const executablePath = `${os.homedir()}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;

const browser = await chromium.launch({
  executablePath,
  args: [`--remote-debugging-port=${port}`, '--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const child = spawn(
    'npx',
    [
      '-y',
      `lighthouse@${LIGHTHOUSE_VERSION}`,
      url,
      `--port=${port}`,
      '--output=json',
      '--output=html',
      `--output-path=${output}`,
      '--only-categories=performance,accessibility,best-practices,seo',
      '--form-factor=mobile',
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  const code = await new Promise((resolve) => child.on('exit', resolve));
  if (code !== 0) {
    console.error(`lighthouse exited with ${code}`);
    process.exitCode = code ?? 1;
  }
} finally {
  await browser.close();
}
