# CleanAir Companion

Privacy-first, location-aware guidance for severe winter smog and urban air
pollution. Families search a city (or consent to geolocation), see live air
quality in two standards, and get a household plan with a labelled
**Direct impact** block for every recommendation.

- **No database, no accounts, no stored personal data, no analytics, no tracking cookies.**
- Next.js App Router + TypeScript (strict) + Tailwind, deployable to Vercel's free tier.
- Air data: [Open-Meteo](https://open-meteo.com/) Air Quality + Geocoding (no key, server-side only).
- Plan generation: Gemini free tier (or any OpenAI-compatible key you wire up), server-side only, with a
  deterministic rule-based fallback that is always available.
- Rate limiting: Upstash Redis (free tier) with a documented per-instance fallback.

---

## Quick start

```bash
npm ci                 # lockfile is committed
cp .env.example .env.local
# fill in GEMINI_API_KEY if you want AI plans; the app works without it
npm run dev            # http://localhost:3000
```

Node 20+ is required.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint (flat config, includes `react/no-danger`, `no-eval`) |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm test` | Vitest unit suite (145 tests) |
| `npm run test:e2e` | Playwright smoke tests (needs `npm run build` first) |
| `npm run test:live` | Live AI-path tests against the real Gemini API; auto-skipped when `GEMINI_API_KEY` is unset |
| `npm run audit` | `npm audit` at every severity |
| `npm run secrets` | gitleaks scan of the working tree |
| `npm run check:bundles` | Greps the client bundle for keys and secret env names |

---

## Environment variables

See `.env.example`. All secrets are **server-only**; nothing is prefixed
`NEXT_PUBLIC_`, because a `NEXT_PUBLIC_` value is compiled into the browser
bundle by definition.

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | no | Server-side LLM key. Unset → fallback plans only. |
| `GEMINI_MODEL` | no | Model id, default `gemini-3.5-flash`. Changing models needs no code change. |
| `LLM_DISABLED` | no | `true` → kill switch; no outbound AI call at all. |
| `DAILY_LLM_CAP` | no | Daily generation cap, default 200 (counter in Upstash). |
| `LLM_ATTEMPT_TIMEOUT_MS` | no | Lower the per-attempt AI timeout. Clamped to 18000, so it can only be tightened. |
| `UPSTASH_REDIS_REST_URL` | prod | Distributed rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | prod | Same. |
| `APP_ORIGIN` | prod | Exact origin for same-origin checks, e.g. `https://cleanair.example`. |

---

## How it works

1. **Location** — city search through Open-Meteo Geocoding, or browser geolocation
   *only after* an explicit consent panel. Coordinates are rounded to 2 decimals
   (~1.1 km) before any API call and are never logged or stored.
2. **Quick profile** — household counts, sensitive-group toggles, home type,
   window/kitchen ventilation, commute mode, budget, room size. Held in React
   state only: a refresh clears it. Defined once as a zod schema shared by client
   and server, with **no free-text field** so nothing a user types can reach the
   model.
3. **Plan** — `/api/plan` re-fetches the air snapshot server-side, builds the
   prompt server-side, and returns either a validated AI plan or the
   deterministic fallback, clearly labelled.

### AQI standards

Both are shown, with source, timestamp and category **text next to the colour**
(colour is never the only indicator):

- **US EPA AQI** — `pm25UsAqi`, `pm10UsAqi`, interpolation over the 2024-revised
  breakpoint tables (`src/lib/aqi.ts`).
- **India CPCB NAQI** — sub-indices for PM2.5, PM10, NO₂ and O₃, overall index is
  the worst sub-index, prominent pollutant reported (`src/lib/naqi.ts`).

The NAQI figure carries a visible assumption: CPCB breakpoints are defined on
24-hour averages, while the app receives hourly model values.

### Fallback plan

`src/lib/fallbackPlan.ts` + `src/lib/planContent.ts` produce a full plan in
English, Hindi (Devanagari) and Telugu for all six severity bands. It is used
when the model is disabled, has no key, is over the daily cap, times out, is
rate limited, returns invalid JSON/schema, returns medication or diagnosis
content, or returns the wrong script. The UI says so, with a reason.

### Sample data

`src/lib/sampleData.ts` contains hand-written illustrative numbers. They are
used **only** when the user toggles demo mode, or when live air data could not be
fetched. Every surface that shows them carries a "Sample data" banner, and the
server also labels the plan response `sample: true`.

---

## Free-tier deployment (Vercel)

1. Push the repository, import it in Vercel as a Next.js project (zero config).
2. Create a free Upstash Redis database, then add `UPSTASH_REDIS_REST_URL`,
   `UPSTASH_REDIS_REST_TOKEN`, `APP_ORIGIN` (your production URL) and
   `GEMINI_API_KEY` as Project → Settings → Environment Variables.
3. Deploy. Nothing else is needed: there is no database, no migration, no cron.

Free-tier notes: Vercel's hobby plan is non-commercial; Open-Meteo's free API is
also for **non-commercial use** (10k calls/day, 5k/hour, 600/minute).

### `/api/plan` time budget on Vercel

A slow model must never make the platform kill the invocation: a killed function
returns a raw 504 (`FUNCTION_INVOCATION_TIMEOUT`), while the user needs the
labelled deterministic plan. So the route owns its clock and returns before
Vercel does.

**Checked against the official docs**
([vercel.com/docs/functions/limitations](https://vercel.com/docs/functions/limitations),
November 2026): on the Hobby plan the maximum function duration is **300 s**, and
300 s is also the default, so `maxDuration` cannot raise it. The route therefore
does not try to use that ceiling — it declares a much smaller one and budgets the
model inside it.

| Value | Where | Why |
| --- | --- | --- |
| `maxDuration = 45` s | `src/app/api/plan/route.ts` | Explicit, far below the 300 s Hobby ceiling, so a hung request can never sit for minutes. |
| Air fetch ≤ 5 s | `UPSTREAM_TIMEOUT_MS` | Open-Meteo runs before the model and counts against the same clock. |
| One LLM attempt ≤ 18 s | `LLM_ATTEMPT_TIMEOUT_MS` | Measured live latency is 10.1 s (en), 10.8 s (hi), 13.2 s (te); 18 s leaves ~5 s of headroom over the slowest language. |
| All attempts ≤ 25 s | `LLM_TOTAL_BUDGET_MS` | Two 18 s attempts cannot fit, so the shared deadline caps the second one at the time actually left. 25 s is also the ceiling the UI quotes, so the promise and the budget cannot drift apart. |
| Response margin 5 s | `ROUTE_RESPONSE_MARGIN_MS` | Time to serialise the JSON and write the response before the platform kill. |

Worst case: 5 + 25 + 5 = **35 s**, inside `maxDuration = 45`, with 10 s left for
cold start and scheduling jitter. (The previous 30 s LLM budget gave a 40 s worst
case; it was tightened to 25 s so the LLM can never consume most of the
function's allowance.)

**Retry rule.** A retry only runs when the first attempt finished inside *half*
the LLM budget (12.5 s of 25 s). A slower first attempt — a hang near the 18 s cap,
or a slow answer that then failed validation — breaks the loop and returns the
labelled fallback immediately, because a second attempt could no longer finish
before the deadline. Timeouts, rate limits and a rejected key are never retried
at all. The route also passes its *remaining* wall clock to `generatePlan`, which
clamps it, so if the air fetch was slow the model gets correspondingly less; if
no time is left, the fallback is returned without calling the provider.

The UI shows `Building your plan…` immediately and switches to `Still working,
this can take up to 25 seconds.` (translated) after 5 s, so a slow generation
looks deliberate rather than broken. That message comes with a **Cancel and show
the offline plan** button: it aborts the fetch and builds the deterministic plan
in the browser from the snapshot already on screen (`fallbackReason:
"cancelled"`), so the user never waits 25 s for guidance they can have now. The
route keeps running server-side until its own deadline; the aborted request is
simply not shown. A timeout is a normal 200 response with
`meta.generatedBy: "fallback"`, `meta.fallbackReason: "timeout"`, and the fallback
banner in the plan view — never an error page. `tests/unit/planRoute.test.ts`
proves this against a simulated provider that only settles when aborted.

---

## Attribution and licence notes

- Air quality and geocoding data: **Open-Meteo, CC BY 4.0** — credited in the app
  footer and here. The free API is for non-commercial use. This app is not
  affiliated with Open-Meteo.
- Fonts: **Inter, Noto Sans Devanagari, Noto Sans Telugu** (SIL Open Font
  License), self-hosted at build time by `next/font`. No third-party font or
  script CDN is used, which is what keeps `font-src 'self'` and the strict CSP
  possible.

---

## Decisions made (no questions asked, as requested)

1. **Fallback-first safety.** The AI is an enhancement, never a dependency. Any
   doubt → deterministic plan, with the reason shown.
2. **No free text in the request path at all.** The profile is enums and small
   integers; the air snapshot is fetched server-side. This removes prompt
   injection by construction rather than by filtering.
3. **Strict CSP with per-request nonces** (Next 16 `proxy.ts`, since `middleware.ts`
   is deprecated). Consequence: **every page is dynamically rendered** and no
   CDN-caching of HTML is possible. That is a deliberate trade for a policy with
   no `unsafe-inline`/`unsafe-eval` in production. `'unsafe-eval'` and inline
   styles are enabled in development only, because React Fast Refresh needs them.
4. **Rate limiting fails closed only where money is spent.** `/api/plan` is
   blocked when the limiter is unreachable; `/api/air` and `/api/geocode` degrade
   to a per-instance memory limiter (documented in `SECURITY.md`).
5. **`/api/plan` re-fetches air data.** A caller cannot supply invented air
   readings to the model. The only exception is the explicit `sample: true` demo
   flag, which is labelled in the response and the UI.
6. **Client IP from `x-vercel-forwarded-for` / `x-real-ip` only**, with the
   rightmost `x-forwarded-for` hop as a last resort, and IPs hashed before use as
   rate-limit keys (no raw addresses stored).
7. **No CORS at all.** No `Access-Control-Allow-Origin` header is ever sent;
   `OPTIONS` on `/api/plan` returns 403.
8. **Service worker caches the shell and static assets only.** `/api/*` is never
   intercepted, and requests carrying an `Authorization` header are ignored.
9. **TypeScript pinned to 6.x.** 7.0 is the newest release, but
   `typescript-eslint` (used by `eslint-config-next`) does not support it yet and
   ESLint refuses to run. Pinning to the newest version the toolchain supports
   keeps `lint` and `typecheck` both green; see `SECURITY.md` → limitations.
   There is a Dependabot rule ignoring TS major bumps for the same reason.
10. **Theme choice is not persisted.** Persisting it would mean writing to
    storage for no product benefit, so it lives in memory and defaults to the OS
    preference.
11. **Upstash limiter calls are bounded at 1.5 s.** A hung limiter cannot hold a
    request open; the timeout is treated as "unreachable".
12. **zod runs jitless (`z.config({ jitless: true })`).** By default zod probes
    `Function("")`, which a strict `script-src` blocks — it degrades gracefully,
    but it logs a CSP violation and is the kind of runtime code generation the
    policy exists to prevent. Disabling JIT removes it everywhere.

---

## Privacy and security

- [`PRIVACY.md`](PRIVACY.md) — what is processed, what is never stored, and the
  third-party AI caveat.
- [`SECURITY.md`](SECURITY.md) — STRIDE-lite threat model, risk → mitigation →
  verification table, and known limitations.

---

## Project layout

```
src/app/            layout, page, globals.css, API routes (air, geocode, plan)
src/components/     client UI (app shell, air panel, chart, profile, plan)
src/lib/            aqi, naqi, geo, schemas, prompt, gemini, planService,
                    fallbackPlan, planContent, i18n, rateLimit, sanitize,
                    security, http, air, indices, client
src/proxy.ts        per-request CSP nonce + security headers (Next 16 name)
public/             manifest.webmanifest, sw.js, generated icons
tests/unit/         Vitest suites (offline)
tests/live/         key-gated live AI tests (real Gemini calls via /api/plan)
tests/e2e/          Playwright smoke tests
scripts/            icon generator, client-bundle secret scan
```
