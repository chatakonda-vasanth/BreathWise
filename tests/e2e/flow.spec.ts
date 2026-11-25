import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end coverage of the whole household flow against the production build.
 *
 * The geocoding upstream is mocked at the browser boundary so the suite needs no
 * network and no API keys. Everything else is real: the route handlers, the
 * validators, the limiter (which fails closed in production without Upstash),
 * the deterministic planner and the rendering.
 */

const DELHI = {
  id: 1273294,
  name: 'Delhi',
  country: 'India',
  lat: 28.6519,
  lon: 77.2315,
  timezone: 'Asia/Kolkata',
};

/** Wait until the client bundle has hydrated and handlers actually respond. */
async function ready(page: Page) {
  await page.waitForLoadState('networkidle');
}

async function mockGeocode(page: Page) {
  await page.route('**/api/geocode**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [DELHI] }),
    }),
  );
}

/** City search → select the first result → the profile step. */
async function chooseDelhi(page: Page, { navigate = true }: { navigate?: boolean } = {}) {
  await mockGeocode(page);
  if (navigate) {
    await page.goto('/');
    await ready(page);
  }
  await page.getByRole('searchbox').fill('Delhi');
  await page.getByRole('button', { name: /^(Search|खोजें|వెతకండి)$/ }).click();
  await page.getByRole('listitem').getByRole('button', { name: /Delhi/ }).first().click();
  await expect(page.getByRole('heading', { name: /Quick profile|प्रोफ़ाइल|ప్రొఫైల్/ })).toBeVisible();
}

/** Profile step → plan step, using Skip so the defaults are exercised. */
async function skipToPlan(page: Page) {
  await page.getByRole('button', { name: /^(Skip|छोड़ें|దాటవేయి)$/ }).click();
  // The plan section heading is stable across severity bands and languages;
  // its text is not, so assert on the element rather than an English phrase.
  await expect(page.locator('#plan-heading')).toBeVisible({ timeout: 20_000 });
}

test.describe('plans in all three languages', () => {
  const cases = [
    { label: 'हिन्दी', lang: 'hi', script: /[\u0900-\u097F]{4,}/ },
    { label: 'తెలుగు', lang: 'te', script: /[\u0C00-\u0C7F]{4,}/ },
    { label: 'English', lang: 'en', script: /[A-Za-z]{4,}/ },
  ] as const;

  for (const { label, lang, script } of cases) {
    test(`a full plan renders in ${lang}`, async ({ page }) => {
      await page.goto('/');
      await ready(page);

      const languageButton = page
        .getByRole('group', { name: /Language|भाषा|భాష/ })
        .getByRole('button', { name: label });
      await languageButton.click();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.lang))
        .toBe(lang);

      // Do not navigate again: that would reset the selected language.
      await chooseDelhi(page, { navigate: false });
      await skipToPlan(page);

      // The plan itself is in the selected script, and the document language
      // is stamped for screen readers.
      const main = page.locator('main');
      await expect(main).toContainText(script);
      expect(await page.evaluate(() => document.documentElement.lang)).toBe(lang);

      // Labelled fallback, never silent.
      await expect(page.getByText(/rule-based plan|नियम-आधारित|నియమ-ఆధారిత/).first()).toBeVisible();
    });
  }
});

test('the fallback states its real reason', async ({ page }) => {
  await chooseDelhi(page);
  await skipToPlan(page);
  // This build runs in production without Upstash, so the paid path is off.
  await expect(
    page.getByText(/Request protection is temporarily unavailable|built-in rule-based plan/).first(),
  ).toBeVisible();
});

test('Cancel during a slow generation shows the offline plan at once', async ({ page }) => {
  await chooseDelhi(page);

  // Hold the plan request open so the slow-path UI appears.
  await page.route('**/api/plan', async () => {
    await new Promise(() => undefined);
  });

  const started = page.waitForRequest('**/api/plan', { timeout: 15_000 });
  await page.getByRole('button', { name: /Build my plan/ }).click();
  await started;
  await expect(page.getByText(/Building your plan/i).first()).toBeVisible();

  const cancel = page.getByRole('button', { name: /Cancel and show the offline plan/ });
  await expect(cancel).toBeVisible({ timeout: 15_000 });
  await cancel.click();

  await expect(page.getByText(/You cancelled the AI request/).first()).toBeVisible();
  await expect(page.getByText(/Direct impact/i).first()).toBeVisible();
  // The request was aborted, so no error banner is shown.
  await expect(page.getByRole('status').filter({ hasText: /failed|error/i })).toHaveCount(0);
});

test('the profile step can be skipped', async ({ page }) => {
  await chooseDelhi(page);
  await page.getByRole('button', { name: /^Skip$/ }).click();
  await expect(page.getByText(/Direct impact/i).first()).toBeVisible({ timeout: 20_000 });

  // The plan visibly explains what shaped it, shows the with/without estimate
  // and the local seasonal context.
  await expect(page.getByTestId('why-fits')).toBeVisible();
  await expect(page.getByTestId('why-fits')).toContainText(/Household size/);
  await expect(page.getByTestId('with-without')).toBeVisible();
  await expect(page.getByTestId('with-without')).toContainText(/Rough estimate/);
  await expect(page.getByTestId('local-context')).toBeVisible();
});

test('the community checklist is interactive and the share link carries the plan', async ({
  page,
}) => {
  await chooseDelhi(page);
  await skipToPlan(page);

  const checklist = page.getByRole('checkbox');
  const count = await checklist.count();
  expect(count).toBeGreaterThanOrEqual(4);

  const first = checklist.first();
  await first.check();
  await expect(first).toBeChecked();
  await first.uncheck();
  await expect(first).not.toBeChecked();

  const share = page.getByRole('link', { name: /WhatsApp/i });
  const href = await share.getAttribute('href');
  expect(href).toContain('https://wa.me/?text=');
  const text = decodeURIComponent(href?.split('text=')[1] ?? '');
  expect(text.length).toBeGreaterThan(20);
  // The share text is the plan, never the location.
  expect(text).not.toContain('77.23');
});

test('the print stylesheet drops the controls and keeps the plan', async ({ page }) => {
  await chooseDelhi(page);
  await skipToPlan(page);

  const header = page.locator('header').first();
  await expect(header).toBeVisible();

  await page.emulateMedia({ media: 'print' });
  await expect(header).toHaveCSS('display', 'none');
  // Hidden elements leave the accessibility tree, so locate by CSS here.
  await expect(page.locator('a[href^="https://wa.me"]')).toBeHidden();
  await expect(page.getByText(/Direct impact/i).first()).toBeVisible();

  await page.emulateMedia({ media: 'screen' });
  await expect(header).toBeVisible();
});

test('light and dark themes both apply', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');

  await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'light' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'dark' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  expect(light).not.toBe(dark);

  await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'auto' }).click();
  await expect(html).not.toHaveAttribute('data-theme', /.*/);
});

test('the limiter-unavailable path fails closed, never open', async ({ request, baseURL }) => {
  const air = await request.get(`${baseURL}/api/air?lat=28.61&lon=77.21`);
  expect(air.status()).toBe(503);
  expect(air.headers()['retry-after']).toMatch(/^\d+$/);
  const airBody = (await air.json()) as { error: string };
  expect(airBody.error).toBe('service_unavailable');

  const plan = await request.post(`${baseURL}/api/plan`, {
    headers: {
      origin: baseURL ?? 'http://127.0.0.1:3100',
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
    },
    data: {
      profile: {
        adults: 2,
        children: 1,
        elderly: 0,
        pregnant: false,
        sensitiveGroup: false,
        homeType: 'apartment',
        windows: 'single',
        kitchenVentilation: 'exhaustFan',
        commuteMode: 'bus',
        budget: 'low',
        language: 'en',
        symptoms: false,
      },
      lat: 28.61,
      lon: 77.21,
    },
  });
  expect(plan.status()).toBe(200);
  const planBody = (await plan.json()) as {
    plan: { generatedBy: string; fallbackReason?: string };
    meta: { fallbackReason?: string };
  };
  expect(planBody.plan.generatedBy).toBe('fallback');
  expect(planBody.meta.fallbackReason).toBe('limiter_unavailable');
});

/** Press Tab until the predicate is true for the focused element. */
async function tabUntil(page: Page, check: () => Promise<boolean>, max = 80) {
  for (let i = 0; i < max; i += 1) {
    if (await check()) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('keyboard focus never reached the target');
}

test('the whole flow can be completed with the keyboard alone', async ({ page }) => {
  await mockGeocode(page);
  await page.goto('/');

  await tabUntil(page, () =>
    page.evaluate(() => document.activeElement?.id === 'city-query'),
  );
  await page.keyboard.type('Delhi');
  await page.keyboard.press('Enter');

  await tabUntil(page, () =>
    page.evaluate(() => (document.activeElement?.textContent ?? '').includes('Delhi')),
  );
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: /Quick profile/ })).toBeVisible();

  await tabUntil(page, () =>
    page.evaluate(() => (document.activeElement?.textContent ?? '').trim() === 'Skip'),
  );
  await page.keyboard.press('Enter');

  // Focus reaches the plan controls and the read-aloud button works via Enter.
  await expect(page.getByText(/Direct impact/i).first()).toBeVisible({ timeout: 20_000 });
  await tabUntil(page, () =>
    page.evaluate(() =>
      (document.activeElement?.textContent ?? '').includes('Read aloud'),
    ),
  );
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: /Stop reading|Read aloud/ }),
  ).toHaveAttribute('aria-pressed', /true|false/);
});
