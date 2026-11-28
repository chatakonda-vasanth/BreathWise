## Accessibility (WCAG 2.2 AA)

Accessibility is enforced by tests, not by intention. `tests/e2e/a11y.spec.ts`
holds 25 Playwright tests that drive the real app and scan it with axe-core.

### What is covered

| Requirement                                 | How it is checked                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No serious or critical violations           | axe-core (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) on: empty location screen, profile screen, loading skeletons, air-quality screen (light, dark, low-bandwidth), plan screen in en/hi/te × light/dark, labelled sample fallback, and the plan error banner. Any violation is printed with its target selectors and fails the run.                                                  |
| AA contrast, both themes, all six AQI bands | Contrast is computed from the live DOM for band text and the chart stroke in light and dark; every ratio must be ≥ 4.5:1. Measured: light `good 6.64, moderate 6.38, sensitive 6.80, unhealthy 7.73, veryUnhealthy 8.12, hazardous 9.32`; dark `good 12.60, moderate 13.49, sensitive 11.53, unhealthy 10.25, veryUnhealthy 11.00, hazardous 13.44`.                                               |
| Visible focus                               | Every control shows a 3 px outline with 2 px offset; the test asserts thickness and offset on the focused element.                                                                                                                                                                                                                                                                                 |
| Logical focus order, no keyboard trap       | Forward Tab traversal is recorded; the order must match the DOM, every stop must receive focus, and no element may hold focus against Tab/Shift+Tab.                                                                                                                                                                                                                                               |
| Skip link                                   | First Tab stop, visible on focus, moves focus into `<main>` (which is `tabindex="-1"`).                                                                                                                                                                                                                                                                                                            |
| 44 × 44 px touch targets                    | Every button, link, input, select, summary and checkbox is measured in its rendered box; anything under 44 × 44 CSS px fails and is printed.                                                                                                                                                                                                                                                       |
| Labels on every control                     | Covered twice: axe's `label`, `select-name` and `aria-*` rules in every scan, and role/name locators used throughout the suite (an unnamed control would not resolve).                                                                                                                                                                                                                             |
| Live regions                                | The loading panel carries `aria-busy="true"` + `aria-live="polite"`; error banners use `role="alert"`; the test asserts the attributes, not just the visuals.                                                                                                                                                                                                                                      |
| Correct `lang` per language                 | `document.documentElement.lang` and the content subtree both switch to `en` / `hi` / `te`, so screen readers change voice.                                                                                                                                                                                                                                                                         |
| `prefers-reduced-motion`                    | With reduced motion emulated, animation and transition durations must be ≤ 0.01 s.                                                                                                                                                                                                                                                                                                                 |
| 200 % zoom, 320 px width                    | At 320 CSS px, and at 640 px with a 2× text zoom, `documentElement.scrollWidth` must equal `clientWidth` (measured: 320/320 and 640/640 — no horizontal scroll).                                                                                                                                                                                                                                   |
| Chart has a text alternative                | The trend chart exposes a real `<table>` with `<caption>`, `<thead>` and one row per hour inside a `<details>` element, alongside `role="img"` + `<title>`/`<desc>` on the SVG.                                                                                                                                                                                                                    |
| Colour is never the only indicator          | Every band chip carries its band name as text next to the colour; the test asserts the accessible text, not the hue.                                                                                                                                                                                                                                                                               |
| Hindi and Telugu glyphs                     | With `hi`/`te` selected, the language scope resolves to `Noto Sans Devanagari` / `Noto Sans Telugu`, `document.fonts.check()` reports the sample text as covered (no tofu), the text measures differently from a serif fallback (the page font is really painting it), and every `.woff2` request is same-origin — `next/font` self-hosts, so nothing hits a font CDN and `font-src 'self'` holds. |

### Reproduce it

```bash
# axe + manual checks (starts its own server on :3100)
npx playwright install chromium      # once
npm run build && npm run test:a11y

# Lighthouse (mobile emulation, full report written next to the prefix)
LD_LIBRARY_PATH="$HOME/.local/pw-libs/usr/lib/x86_64-linux-gnu" \
  node scripts/lighthouse.mjs http://127.0.0.1:3110/ /tmp/breathwise-lh
```

`scripts/lighthouse.mjs` launches Playwright's Chromium with a CDP port and
points Lighthouse at it, because Lighthouse's own browser launch crashes in the
container used for these runs. Lighthouse is fetched with a pinned `npx`, so it
never enters the shipped lockfile.

### Latest real result

```
42 passed (1.1m)           # full Playwright suite: 17 smoke/flow + 25 accessibility
accessibility 100          # Lighthouse 12.8.2, mobile emulation
best-practices 100
seo 100
```

### Known limits

- No screen-reader session (NVDA/VoiceOver/TalkBack) was run: this environment
  has no audio or assistive technology. The automated checks above cover the
  programmatic side (names, roles, states, live regions, order, reflow).
- Lighthouse cannot audit the plan screen (it needs a search and a render), so
  that state is covered by axe only.

