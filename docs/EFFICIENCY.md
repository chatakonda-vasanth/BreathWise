## Efficiency

### Measured, before and after

All numbers below come from this repository, in this container, against the
production server (`npm run build && npm run start`), with the command listed in
each row.

| Measurement                                     | Before                               | After                                          | Command                               |
| ----------------------------------------------- | ------------------------------------ | ---------------------------------------------- | ------------------------------------- |
| First-load JavaScript (gzipped, real SSR HTML)  | **243.1 KiB**                        | **200.8 KiB**                                  | `node scripts/client-bundle-size.mjs` |
| Largest chunk                                   | 72.7 KiB (zod + all three languages) | 70.1 KiB (framework runtime)                   | ↑                                     |
| Lighthouse Performance (mobile emulation)       | 77                                   | **81**                                         | `node scripts/lighthouse.mjs`         |
| Lighthouse Accessibility / Best Practices / SEO | 100 / 100 / 100                      | 100 / 100 / 100                                | ↑                                     |
| Largest Contentful Paint                        | 4.2 s                                | 3.6-3.9 s (run-to-run noise in this container) | ↑                                     |
| Total Blocking Time                             | 390 ms                               | 290 ms                                         | ↑                                     |
| Cumulative Layout Shift                         | 0                                    | 0                                              | ↑                                     |
| Total page weight                               | 566 KiB                              | 524 KiB                                        | ↑                                     |
| Unused JavaScript (Lighthouse estimate)         | 88 KiB                               | 54 KiB                                         | ↑                                     |

`scripts/client-bundle-size.mjs` reads the scripts out of the server-rendered
HTML, gzips each file and prints the table, because Turbopack builds do not print
per-route sizes. It measures what the browser downloads before hydration, not a
sum of node_modules.

### What changed

1. **zod is server-only.** `src/lib/shared/responseGuards.ts` replaces the three
   response schemas the browser used to parse: hand-written structural guards
   for `/api/air`, `/api/geocode` and `/api/plan`. The server still parses every
   input with zod, because that is the trust boundary; the browser only needs to
   refuse a body whose shape is wrong. This removed the largest single chunk.
2. **Language packs load on demand.** English is in the first load (it defines
   the key type). Hindi and Telugu live in `src/lib/i18n/hi.ts` and `te.ts` and
   are imported the first time someone selects that language; `AppShell` awaits
   `loadLanguage()` before switching, so a half-translated screen is impossible.
3. **The chart and the plan screen are separate chunks.** `next/dynamic` for
   `TrendChart` (only needed once air data exists) and `PlanView` (only reachable
   after a submit).
4. **Upstream air data is cached for 10 minutes** (`src/lib/air/airCache.ts`), keyed
   by the rounded coordinate pair, caching the pending promise so concurrent
   requests share one fetch. A rejected fetch is never cached. Both `/api/air`
   and `/api/plan` use it, so the plan request made seconds after the air screen
   costs no second upstream call.
5. **No repeated model calls in a session.** `AppShell` keys a plan cache on
   profile + language + severity band + sample flag + coordinates; a regenerate
   that would produce an identical answer is served from memory, so it spends no
   rate-limit token and no model call. The cap and limiter paths return before
   any model call, so a blocked request never reaches the model either.
6. **Caching headers are explicit.** `/_next/static/*` is
   `public, max-age=31536000, immutable` (verified with `curl -D -`), every
   `/api/*` response is `no-store` (set in `src/lib/shared/http.ts` and again in
   `src/proxy.ts`), and the service worker never intercepts `/api/`.

### Why 150 KiB was not reached

The 150 KiB target is **not met**: 202.0 KiB gzipped at the last measurement (200.8
KiB before the quick-question UI strings and buttons).

The floor is the framework, not this app: React 19 + the Next.js client runtime +
its always-included polyfill chunk measure **158.6 KiB gzipped** on their own
(70.1 + 47.5 + 38.7 + 3.8 KiB), before a single line of application code. That
already exceeds 150 KiB, so the budget is unreachable without dropping the
framework for a smaller one - a rewrite, not an optimisation.

What is left above that floor is 42.2 KiB gz of application code: the English UI
strings (the source of truth for the key type), the components, the AQI/NAQI
maths the app runs locally, and the guards above. The two remaining candidates
(band label tables per language, `fallbackPlan` split out) are worth roughly
5-8 KiB gz together and would push guide text behind async boundaries; that was
rejected as a worse trade for the reader than the bytes saved.

The `browserslist` experiment was tried and reverted: pinning modern browsers
changed the build by 0 bytes, because this Next version ships the polyfill chunk
unconditionally.
