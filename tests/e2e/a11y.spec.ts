import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility gate (WCAG 2.2 AA).
 *
 * Every main screen and state is scanned with axe-core: empty, loading, AQI
 * shown, plan shown, labelled sample fallback, error banners, all three
 * languages and both themes. The suite also checks the things axe cannot:
 * focus order, the skip link, touch-target size, reduced motion, reflow at
 * 320 px and the chart's table alternative.
 *
 * Run with: npm run test:a11y
 */

const AIR = {
  air: {
    lat: 28.65,
    lon: 77.23,
    timezone: 'Asia/Kolkata',
    fetchedAt: '2026-11-25T10:00:00.000Z',
    current: {
      time: '2026-11-25T10:00',
      usAqi: 184,
      pm25: 140,
      pm10: 250,
      no2: 45,
      o3: 60,
    },
    history: points(24, 110),
    forecast: points(24, 160),
    source: 'Open-Meteo Air Quality (CAMS)',
    isSample: false,
  },
  indices: {
    usAqi: 184,
    usBand: 'unhealthy',
    naqi: {
      value: 210,
      band: 'poor',
      dominantPollutant: 'pm25',
      subIndices: { pm25: 210 },
    },
    severity: 'unhealthy',
    changeSinceYesterday: 12,
  },
};

function points(count: number, value: number) {
  return Array.from({ length: count }, (_, index) => ({
    time: `2026-11-25T${String(index).padStart(2, '0')}:00`,
    usAqi: value + (index % 5) * 3,
    pm25: Math.round(value * 0.7),
    pm10: Math.round(value * 1.3),
    no2: 40,
    o3: 55,
  }));
}

const DELHI = {
  id: 1273294,
  name: 'Delhi',
  country: 'India',
  lat: 28.6519,
  lon: 77.2315,
  timezone: 'Asia/Kolkata',
};

const LANGUAGE_BUTTON = { en: 'English', hi: 'हिन्दी', te: 'తెలుగు' } as const;
type Lang = keyof typeof LANGUAGE_BUTTON;
const SEARCH = /^(Search|खोजें|వెతకండి)$/;
const SKIP = /^(Skip|छोड़ें|దాటవేయి)$/;

async function mockGeocode(page: Page) {
  await page.route('**/api/geocode**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [DELHI] }),
    }),
  );
}

async function mockAir(page: Page) {
  await page.route('**/api/air**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AIR),
    }),
  );
}

async function setLanguage(page: Page, lang: Lang) {
  await page
    .getByRole('group', { name: /Language|भाषा|భాష/ })
    .getByRole('button', { name: LANGUAGE_BUTTON[lang] })
    .click();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(lang);
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page
    .getByRole('group', { name: /Theme|थीम|థీమ్/ })
    .getByRole('button', { name: theme })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function openProfile(page: Page) {
  await page.getByRole('searchbox').fill('Delhi');
  await page.getByRole('button', { name: SEARCH }).click();
  await page.getByRole('listitem').getByRole('button', { name: /Delhi/ }).first().click();
  await expect(page.locator('#profile-heading')).toBeVisible();
}

async function openPlan(page: Page) {
  await page.getByRole('button', { name: SKIP }).click();
  await expect(page.locator('#plan-heading')).toBeVisible({ timeout: 20_000 });
}

/** axe scan over the rendered screen; fails on any serious or critical issue. */
async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  if (results.violations.length > 0) {
    console.log(
      `\n[axe:${label}] ${results.violations.length} violation(s)\n` +
        JSON.stringify(
          results.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.length,
            help: v.help,
            targets: v.nodes.slice(0, 4).map((n) => n.target.join(' ')),
          })),
          null,
          2,
        ),
    );
  }
  expect(
    serious,
    `${label}: ${serious.map((v) => `${v.id} (${v.nodes.length})`).join(', ')}`,
  ).toEqual([]);
}

test.describe('axe-core on every screen and state', () => {
  test('empty location screen, light and dark', async ({ page }) => {
    await page.goto('/');
    await scan(page, 'empty/light');
    await setTheme(page, 'dark');
    await scan(page, 'empty/dark');
  });

  test('profile screen, light and dark', async ({ page }) => {
    await mockGeocode(page);
    await mockAir(page);
    await page.goto('/');
    await openProfile(page);
    await scan(page, 'profile/light');
    await setTheme(page, 'dark');
    await scan(page, 'profile/dark');
  });

  test('loading state (skeletons) while air data is in flight', async ({ page }) => {
    await mockGeocode(page);
    let release: (() => void) | undefined;
    await page.route('**/api/air**', async (route) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(AIR),
      });
    });
    await page.goto('/');
    await openProfile(page);
    await expect(page.getByText(/Loading|लोड|లోడ్/).first()).toBeAttached();
    await scan(page, 'loading');
    release?.();
    await expect(page.locator('#air-heading')).toBeVisible();
  });

  test('air quality screen, light, dark and low-bandwidth', async ({ page }) => {
    await mockGeocode(page);
    await mockAir(page);
    await page.goto('/');
    await openProfile(page);
    await expect(page.locator('#air-heading')).toBeVisible();
    await scan(page, 'air/light');
    await setTheme(page, 'dark');
    await scan(page, 'air/dark');
    await page.getByRole('button', { name: /Text-first|पाठ|వచనం/ }).click();
    await scan(page, 'air/dark/low-bandwidth');
  });

  for (const lang of ['en', 'hi', 'te'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test(`plan screen in ${lang}, ${theme}`, async ({ page }) => {
        await mockGeocode(page);
        await mockAir(page);
        await page.goto('/');
        await setLanguage(page, lang);
        await setTheme(page, theme);
        await openProfile(page);
        await openPlan(page);
        await scan(page, `plan/${lang}/${theme}`);
      });
    }
  }

  test('labelled sample fallback (live data unavailable) and its banner', async ({
    page,
  }) => {
    await mockGeocode(page);
    await page.route('**/api/air**', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'upstream_unavailable' }),
      }),
    );
    await page.goto('/');
    await openProfile(page);
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: /Sample|नमूना|నమూనా/ })
        .first(),
    ).toBeVisible();
    await scan(page, 'sample-fallback');
  });

  test('plan error banner', async ({ page }) => {
    await mockGeocode(page);
    await mockAir(page);
    await page.route('**/api/plan', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'rate_limited', message: 'Too many requests' }),
      }),
    );
    await page.goto('/');
    await openProfile(page);
    await page.getByRole('button', { name: /Build my plan/ }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: /could not build the plan/ }),
    ).toBeVisible();
    await scan(page, 'plan-error');
  });
});

test.describe('AA contrast for every band colour in both themes', () => {
  const BANDS = [
    'good',
    'moderate',
    'sensitive',
    'unhealthy',
    'veryUnhealthy',
    'hazardous',
  ] as const;

  for (const theme of ['light', 'dark'] as const) {
    test(`band text and chart line contrast, ${theme}`, async ({ page }) => {
      await page.goto('/');
      await setTheme(page, theme);

      const results = await page.evaluate(
        (bands) => {
          const parse = (value: string) => {
            const [r, g, b] = value.match(/\d+/g)!.slice(0, 3).map(Number) as [
              number,
              number,
              number,
            ];
            return [r, g, b] as const;
          };
          const luminance = ([r, g, b]: readonly [number, number, number]) => {
            const channel = (c: number) => {
              const s = c / 255;
              return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
          };
          const ratio = (
            fg: readonly [number, number, number],
            bg: readonly [number, number, number],
          ) => {
            const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x) as [
              number,
              number,
            ];
            return (a + 0.05) / (b + 0.05);
          };

          const background = parse(getComputedStyle(document.body).backgroundColor);
          const out: { band: string; ink: string; ratio: number }[] = [];
          for (const band of bands) {
            const probe = document.createElement('p');
            probe.className = 'band-colour';
            probe.dataset.band = band;
            probe.textContent = '1';
            document.body.append(probe);
            const ink = getComputedStyle(probe).color;
            out.push({
              band,
              ink,
              ratio: Number(ratio(parse(ink), background).toFixed(2)),
            });
            probe.remove();
          }
          return out;
        },
        BANDS as unknown as string[],
      );

      console.log(
        `\n[contrast:${theme}] ${results.map((r) => `${r.band}=${r.ratio}`).join(' ')}`,
      );
      for (const result of results) {
        expect(
          result.ratio,
          `${theme}/${result.band} (${result.ink})`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

test.describe('keyboard, focus and reflow', () => {
  test('the skip link is first, appears on focus and moves focus to main', async ({
    page,
  }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', {
      name: /Skip to main content|मुख्य सामग्री|ప్రధాన కంటెంట్/,
    });
    await expect(skip).toBeVisible();
    const box = await skip.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
    await expect(page).toHaveURL(/#main$/);
  });

  test('focus order moves forward with no keyboard trap', async ({ page }) => {
    await mockGeocode(page);
    await mockAir(page);
    await page.goto('/');
    await openProfile(page);

    const seen: { id: string; label: string }[] = [];
    for (let index = 0; index < 60; index += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return { id: 'none', label: 'none' };
        // A per-element marker gives each focus stop a stable identity, even
        // when several controls share the same visible text.
        if (!el.dataset.focusProbe) {
          el.dataset.focusProbe = `probe-${Math.random().toString(36).slice(2, 10)}`;
        }
        return {
          id: el.dataset.focusProbe,
          label: `${el.tagName}:${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}`,
        };
      });
      seen.push(focused);
    }
    // Body appears when Tab leaves the document; that is the opposite of a
    // trap, so only in-page elements count towards the repeat check.
    const inPage = seen.filter((entry) => !entry.label.startsWith('BODY:'));
    expect(new Set(inPage.map((entry) => entry.label)).size).toBeGreaterThan(8);
    let repeats = 0;
    for (let index = 1; index < inPage.length; index += 1) {
      if (inPage[index]?.id === inPage[index - 1]?.id) repeats += 1;
    }
    expect(repeats, 'focus was stuck on the same control across Tab presses').toBe(0);
  });

  test('the visible focus ring is thick and offset', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const style = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const computed = getComputedStyle(el);
      return { outlineStyle: computed.outlineStyle, outlineWidth: computed.outlineWidth };
    });
    expect(style.outlineStyle).not.toBe('none');
    expect(Number.parseFloat(style.outlineWidth)).toBeGreaterThanOrEqual(3);
  });

  test('touch targets are at least 44 by 44 CSS pixels', async ({ page }) => {
    await mockGeocode(page);
    await mockAir(page);
    await page.goto('/');
    await openProfile(page);
    await openPlan(page);

    const small = await page.evaluate(() => {
      const targets = Array.from(
        document.querySelectorAll<HTMLElement>(
          'main button, main a[href], main input, main select, main summary, header button, header a[href], footer summary',
        ),
      ).filter((el) => {
        const box = el.getBoundingClientRect();
        return (
          box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden'
        );
      });
      const failures: { label: string; width: number; height: number }[] = [];
      for (const el of targets) {
        // A checkbox or radio inside a larger label may use the label's box.
        const box =
          el instanceof HTMLInputElement &&
          (el.type === 'checkbox' || el.type === 'radio')
            ? (el.closest('label') ?? el).getBoundingClientRect()
            : el.getBoundingClientRect();
        if (box.width < 44 || box.height < 44) {
          failures.push({
            label: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName)
              .trim()
              .slice(0, 50),
            width: Math.round(box.width),
            height: Math.round(box.height),
          });
        }
      }
      return failures;
    });

    if (small.length > 0) console.log(`\n[targets] ${JSON.stringify(small, null, 2)}`);
    expect(small).toEqual([]);
  });

  test('the document language follows the chosen language', async ({ page }) => {
    await page.goto('/');
    for (const lang of ['hi', 'te', 'en'] as const) {
      await setLanguage(page, lang);
      const lang2 = await page.evaluate(() => document.documentElement.lang);
      expect(lang2).toBe(lang);
      // The subtree carrying the strings is stamped too, so a screen reader
      // switches voice for the content, not only for the page.
      expect(await page.locator('[lang]').first().getAttribute('lang')).toBe(lang);
    }
  });

  test('reduced motion removes animation and transition duration', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const durations = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.className = 'skeleton';
      document.body.append(probe);
      const style = getComputedStyle(probe);
      const value = {
        animation: style.animationDuration,
        transition: style.transitionDuration,
      };
      probe.remove();
      return value;
    });
    expect(Number.parseFloat(durations.animation)).toBeLessThanOrEqual(0.01);
    expect(Number.parseFloat(durations.transition)).toBeLessThanOrEqual(0.01);
  });

  test('320 px width and 200% zoom do not scroll horizontally', async ({ page }) => {
    await mockGeocode(page);
    await mockAir(page);
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await openProfile(page);
    await openPlan(page);

    const overflow = () =>
      page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

    const at320 = await overflow();
    console.log(
      `\n[reflow] 320px scrollWidth=${at320.scrollWidth} clientWidth=${at320.clientWidth}`,
    );
    expect(at320.scrollWidth).toBeLessThanOrEqual(at320.clientWidth + 1);

    // 200% text zoom: the root font size doubles, and Tailwind's rem-based
    // spacing has to reflow instead of clipping.
    await page.setViewportSize({ width: 640, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    const zoomed = await overflow();
    console.log(
      `[reflow] 640px @200% scrollWidth=${zoomed.scrollWidth} clientWidth=${zoomed.clientWidth}`,
    );
    expect(zoomed.scrollWidth).toBeLessThanOrEqual(zoomed.clientWidth + 1);
  });

  test('colour is never the only indicator and the chart has a table alternative', async ({
    page,
  }) => {
    await mockGeocode(page);
    await mockAir(page);
    await page.goto('/');
    await openProfile(page);
    await expect(page.locator('#air-heading')).toBeVisible();

    // Band chip: glyph + full text label, not just a colour.
    const chip = page.locator('.band-chip').first();
    await expect(chip).toContainText(/Unhealthy|अस्वस्थ|అనారోగ్య/);
    expect((await chip.textContent())?.trim().length ?? 0).toBeGreaterThan(4);

    // The chart exposes its values as a table with a caption.
    const table = page.locator('figure table').first();
    await expect(table).toBeAttached();
    await expect(table.locator('caption')).toHaveText(/.+/);
    expect(await table.locator('tbody tr').count()).toBeGreaterThan(10);
  });

  test('loading and error messages are live regions', async ({ page }) => {
    await mockGeocode(page);
    let release: (() => void) | undefined;
    await page.route('**/api/air**', async (route) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(AIR),
      });
    });
    await page.goto('/');
    await openProfile(page);

    const busy = page.locator('[aria-busy="true"]');
    await expect(busy).toHaveAttribute('aria-live', 'polite');
    release?.();
    await expect(page.locator('#air-heading')).toBeVisible();
  });
});

test.describe('self-hosted Hindi and Telugu fonts', () => {
  const SAMPLES = {
    hi: { text: 'वायु गुणवत्ता सूचकांक', font: /devanagari/i, family: '--font-hindi' },
    te: { text: 'గాలి నాణ్యత సూచిక', font: /telugu/i, family: '--font-telugu' },
  } as const;

  for (const lang of ['hi', 'te'] as const) {
    test(`${lang} text is drawn by its own self-hosted font with no missing glyphs`, async ({
      page,
    }) => {
      await mockGeocode(page);
      await mockAir(page);
      await page.goto('/');
      await openProfile(page);
      await setLanguage(page, lang);
      await page.evaluate(() => document.fonts.ready);

      const report = await page.evaluate(({ text, family }) => {
        const scopes = [...document.querySelectorAll('[lang]')];
        const scope = scopes.find(
          (node) => node.getAttribute('lang') === document.documentElement.lang,
        );
        const style = getComputedStyle(scope ?? document.body);
        const fontFamily = style.fontFamily;
        const families = fontFamily
          .split(',')
          .map((entry) => entry.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);

        // Check width of the sample with the page font versus a generic
        // fallback: identical widths would mean the page font is not used.
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const measure = (font: string) => {
          if (!context) return -1;
          context.font = `700 32px ${font}`;
          return Math.round(context.measureText(text).width * 100) / 100;
        };
        const primary = families[0] ?? 'sans-serif';
        return {
          lang: document.documentElement.lang,
          fontFamily,
          familyVariable: family,
          covers: document.fonts.check(`700 32px "${primary}"`, text),
          loadedFonts: [...document.fonts].map((face) => ({
            family: face.family,
            status: face.status,
          })),
          widthWithPageFont: measure(`"${primary}"`),
          widthWithFallback: measure('serif'),
          fontRequests: performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .filter((name) => name.endsWith('.woff2') || name.endsWith('.woff')),
        };
      }, SAMPLES[lang]);

      console.log(`\n[fonts:${lang}] ${JSON.stringify(report)}`);

      // The language scope must resolve to the script-specific family.
      expect(report.fontFamily).toMatch(SAMPLES[lang].font);
      // The face must be loaded and advertise coverage of the sample text,
      // which is what rules out tofu boxes for these glyphs.
      expect(report.covers).toBe(true);
      // And the text must actually measure differently from a generic serif
      // fallback, i.e. the page font is the one painting it.
      expect(report.widthWithPageFont).not.toBe(report.widthWithFallback);
      // Self-hosted: every font file comes from this origin, never Google.
      expect(report.fontRequests.length).toBeGreaterThan(0);
      for (const request of report.fontRequests) {
        expect(new URL(request).origin).toBe(new URL(page.url()).origin);
      }
    });
  }
});
