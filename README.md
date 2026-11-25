# CleanAir Companion

[![CI](https://github.com/chatakonda-vasanth/BreathWise/actions/workflows/ci.yml/badge.svg)](https://github.com/chatakonda-vasanth/BreathWise/actions/workflows/ci.yml)

**The problem.** Every winter, severe smog and urban air pollution force families
across South Asia to make daily decisions — whether a child walks to school,
whether to open a window, whether to spend money on a purifier — with no
practical, household-level guidance. CleanAir Companion is a GenAI assistant
that turns public air-quality data into low-emission daily routines, indoor air
hacks and sustainable alternatives tailored to a household's location and
lifestyle, while explaining the direct impact of each suggestion. It is
privacy-first by construction: no accounts, no database, no stored location, and
no place name ever sent to the model. Every regional or impact claim is
conservative, labelled as an estimate, and carries its assumption.

**Live demo:** <https://breathwise-u27mzs.freebuff.site>

## Run it in 3 commands

No API keys, no database and no environment variables are needed.

```bash
npm ci
npm run dev
# open http://localhost:3000
```

Without `GEMINI_API_KEY` the app serves the deterministic rule-based plan,
clearly labelled with its reason; if live air data cannot be fetched it falls
back to an explicitly labelled sample snapshot. Both are visible on screen, never
silent. Node 20+.

## Architecture

```
                       ┌──────────────────────────────────────────┐
 browser (no secrets)  │  React client (app-shell, plan-view)     │
                       │  · profile stays in React state          │
                       │  · regional + impact layers run locally  │
                       └───────────────┬──────────────────────────┘
                                       │ same-origin fetch only (connect-src 'self')
                       ┌───────────────▼──────────────────────────┐
                       │  Next.js route handlers (server)         │
                       │  /api/geocode  /api/air  /api/plan       │
                       │  /api/health   /.well-known/security.txt │
                       │  · origin + IP + size checks             │
                       │  · rate limit → fail closed              │
                       │  · zod validation, no free text          │
                       └───────┬───────────────────────┬──────────┘
                               │ fixed hosts           │ fixed host, key in header
                    ┌──────────▼─────────┐   ┌─────────▼──────────────┐
                    │ Open-Meteo (CAMS)  │   │ Gemini (server-side)   │
                    │ air + geocoding    │   │ JSON schema, no tools  │
                    └────────────────────┘   └────────────────────────┘
                               │
                    deterministic fallback planner (always available,
                    labelled with its reason: timeout, cap, disabled…)
```

Admin/build notes: headers and CSP are built per request in `src/proxy.ts`, the
service worker never touches `/api/`, and the deployment builds with no
`.env.local` so no secret can be baked into the bundle.

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
| `npm test` | Vitest unit + security suites with v8 coverage gates (336 tests) |
| `npm run test:e2e` | Playwright smoke tests (needs `npm run build` first) |
| `npm run test:live` | Live AI-path tests against the real Gemini API; auto-skipped when `GEMINI_API_KEY` is unset |
| `npm run audit` | `npm audit` at every severity |
| `npm run secrets` / `npm run secrets:dir` | gitleaks scan of the full git history / the working tree |
| `npm run smoke -- <url>` | Post-deploy smoke test (headers, health, CORS, service worker) |
| `npm run check:bundles` | Greps the client bundle for keys and secret env names |
| `npm run check:secrets-in-bundle` | Greps the deployment output for secret values, key shapes and server-only names |
| `npm run test:security` | The attack-focused suite in `tests/security` |
| `npm run verify` | Lint → typecheck → tests with coverage → build → both bundle scans, with no env vars |

---

## Environment variables

See `.env.example`. All secrets are **server-only**; nothing is prefixed
`NEXT_PUBLIC_`, because a `NEXT_PUBLIC_` value is compiled into the browser
bundle by definition.

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | no | Server-side LLM key. Unset → fallback plans only. |
| `GEMINI_MODEL` | yes (recommended) | Model id, default `gemini-3.5-flash`. Changing models needs no code change. The startup check names it if missing, so production never depends on an implicit default. |
| `LLM_DISABLED` | no | `true` → kill switch; no outbound AI call at all. |
| `DAILY_LLM_CAP` | no | Daily generation cap, default 200 (counter in Upstash). |
| `LLM_ATTEMPT_TIMEOUT_MS` | no | Lower the per-attempt AI timeout. Clamped to 18000, so it can only be tightened. |
| `UPSTASH_REDIS_REST_URL` | **yes (production)** | Distributed rate limiting. Without it production refuses to spend: `/api/plan` returns the labelled fallback plan, the other API routes return 503. |
| `UPSTASH_REDIS_REST_TOKEN` | **yes (production)** | Same — both are needed. |
| `APP_ORIGIN` | prod | Exact origin (`scheme://host[:port]`) for same-origin checks, e.g. `https://cleanair.example`. Must include the scheme: a value that is not an absolute http(s) origin is reported at startup and makes every `POST /api/plan` return 403. Unset → the request `Host` is used. |

---

## Evaluation evidence

Every result below was produced in this environment, at the commit that contains
this file. Re-run the command to check it; nothing here is estimated.

| Area | Command to reproduce | Latest real result |
| --- | --- | --- |
| Code quality | `npm run lint && npm run typecheck` | eslint exit 0, `tsc --noEmit` exit 0 (strict, `noUncheckedIndexedAccess`) |
| Testing | `npm test` | 25 test files, **336 tests passed**; coverage for `src/lib`: statements 96.86%, branches 91.65%, functions 99.41%, lines 98.58% (gate: 90/85/90/90) |
| End-to-end | `npm run build && npm run test:e2e` | **17 Playwright tests passed** (3 languages, fallback labelling, cancel, skip, community checklist + share, print stylesheet, light/dark, limiter-unavailable, keyboard-only) |
| Security | `npm run test:security` | 9 files, **83 tests passed** (origin/IP spoofing, oversized bodies, prompt injection, XSS, medical guard, headers/CSP, bundle secret scan, security.txt) |
| Supply chain | `npm audit --audit-level=low` | `found 0 vulnerabilities` |
| Secrets | `npm run secrets` (history) and `npm run secrets:dir` (working tree) | no leaks in either scan (gitleaks exits 0) |
| Bundle secrets | `npm run check:bundles && npm run check:secrets-in-bundle` | both PASS — no key value, key shape or server-only variable name in the client bundles or deployment output |
| Efficiency | not measured in this environment | **not verified in this environment** — no Lighthouse or bundle-size run was made after the final change |
| Accessibility | `npm run test:e2e` (keyboard-only test, role/name locators) | Keyboard-only completion of search → plan passes; every control is reached by Tab and has an accessible name. No automated axe/WCAG scan was run, so this is **partial** |
| Problem alignment | `npm test` (impact + regional suites) and the table below | Regional layer, "why this plan fits you", with/without estimate and community checklist covered by unit tests; see [How this addresses the problem](#how-this-addresses-the-problem) |
| Deployed production | `npm run smoke -- https://breathwise-u27mzs.freebuff.site` | **12 passed, 0 failed** (CSP/HSTS/nosniff/referrer/permissions, health, cross-origin 403, no CORS, service worker never caches `/api/`); live `/api/air` returned 200 with `usAqi: 184, sample: false`; `/.well-known/security.txt` served the placeholder contact over HTTPS |
| One-command check | `npm run verify` | exit 0: lint → typecheck → tests with coverage → build → client-bundle scan → deployment-output secret gate |

**Not verified in this environment:** real-device accessibility with a screen
reader, Safari/Firefox rendering, Lighthouse performance, Vercel's real proxy
header injection, and a full manual attack on the deployed origin (the post-deploy
smoke script covers headers, CORS, health, the service worker and live air data).

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

## How this addresses the problem

The brief: an assistant that helps families and communities navigate severe
winter smog by suggesting low-emission routines, indoor air hacks and sustainable
alternatives tailored to location and lifestyle, while explaining the direct
impact, with every regional or impact claim conservative, labelled and carrying
its assumption.

| Requirement | Where it lives | What proves it |
| --- | --- | --- |
| Location tailoring without sending a place to the model | `src/lib/regional.ts` — static coarse-region + season table, browser-only; documented in [`PRIVACY.md`](PRIVACY.md) | `tests/unit/regional.test.ts` (region/season/burning/inversion cases; asserts `prompt.ts`, `planService.ts` and `gemini.ts` never import it) |
| Lifestyle tailoring, visibly used | `src/lib/impact.ts` (`whyThisPlanFits`), rendered by `src/components/personal-context.tsx` (`WhyThisPlanFits`) and passed `profile` from `src/components/app-shell.tsx` | `tests/unit/impact.test.ts` (“names every household input that shaped the plan”) |
| “Why this plan fits you” summary | `WhyThisPlanFits` card on every plan | `tests/unit/impact.test.ts`; `tests/e2e/flow.spec.ts` asserts the card renders |
| Direct impact with a deterministic with/without estimate | `compareWithWithout` + `IMPACT_FACTORS` in `src/lib/impact.ts`, rendered by `WithWithoutCard` | `tests/unit/impact.test.ts` (AQI 0, 500+, no profile, each budget, each glazing) |
| “Rough estimate” next to every number, in English, Hindi and Telugu | `ImpactLabels.roughEstimate` in `src/lib/impact.ts`, printed beside each value | `tests/unit/impact.test.ts` (“labels the estimate as rough in all three languages”) |
| Direct Impact block (mechanism, estimate, assumption, confidence) on every recommendation | `Recommendation.impact` in `src/lib/types.ts`; enforced by the response schema and rendered in `src/components/plan-view.tsx` | `tests/unit/schemas.test.ts`, `tests/unit/fallback.test.ts`; `tests/e2e/flow.spec.ts` asserts “Direct impact” on the plan |
| Community checklist (school, workplace, resident association, no-burning, carpool) | `communityItems` in `src/lib/i18n.ts`, rendered in “Community mode” | `tests/unit/keyHygiene.test.ts` (every UI key exists in all three languages); e2e checks the checklist is interactive and shareable |
| Conservative, labelled regional and impact claims | Every regional note and impact factor states its assumption; see `src/lib/regional.ts`, `src/lib/impact.ts`, `src/lib/fallbackPlan.ts` | `tests/unit/impact.test.ts` (each step has an assumption), `tests/unit/regional.test.ts` (assumption label present) |

## Deploy (Vercel)

Zero config: there is no database, no migration, no cron, no server action and
**no `vercel.json`**. Headers, CSP and the service worker are all set per request
in `src/proxy.ts` and `public/sw.js`, so a `vercel.json` would only add a second
place for security behaviour to drift out of sync. If one is ever needed, it must
not define `headers`, `routes` or `redirects` that replace the proxy's CSP or any
other security header listed in [`SECURITY.md`](SECURITY.md).

### 1. Import and deploy

1. Push the repository and import it in Vercel as a Next.js project. The preset
   detects Next.js; keep the defaults (build `npm run build`, no output
   directory override, Node 20+).
2. Create a free Upstash Redis database, then add the variables below under
   Project → Settings → Environment Variables for **Production** (add them to
   Preview too if preview deployments should work).
3. Deploy, then run the [smoke test](#3-post-deploy-smoke-test) against the URL
   Vercel gives you.

### 2. Environment variables

The complete list. Every one is server-side only; the deployment never contains a
`NEXT_PUBLIC_` value. The examples are **placeholders** — paste your own, never a
real key, and never commit them.

| Variable | Required | Safe example value | Purpose |
| --- | --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | **yes in production** | `https://example-12345.upstash.io` | Distributed rate limiting and the daily LLM counter. |
| `UPSTASH_REDIS_REST_TOKEN` | **yes in production** | `replace-with-the-upstash-rest-token` | Same database; both are needed. |
| `GEMINI_MODEL` | **yes** | `gemini-3.5-flash` | Model id, no `models/` prefix. Kept in the environment so a model change needs no redeploy of code. |
| `GEMINI_API_KEY` | recommended | `replace-with-your-google-ai-studio-key` | Server-side LLM key. Unset → deterministic plans only; the app still works. |
| `LLM_DISABLED` | no (default `false`) | `true` | Kill switch: `true` disables every outbound AI call and serves the labelled rule-based plan. |
| `DAILY_LLM_CAP` | no (default `200`) | `200` | Daily LLM generation cap, counted in Upstash. A spend control independent of traffic. |
| `APP_ORIGIN` | **yes in production** | `https://cleanair-companion.vercel.app` | Exact origin for the same-origin check, scheme included (`scheme://host[:port]`). Without it the request `Host` is used. A malformed value is reported by `reportEnv()` and every `POST /api/plan` answers 403 — fail closed, never fail open. |
| `LLM_ATTEMPT_TIMEOUT_MS` | no (default `18000`) | `18000` | Optional tightening of the per-attempt AI timeout. Clamped to 18000, so it can only be lowered. |

`src/instrumentation.ts` runs `reportEnv()` once per server instance and logs a
clear error naming each missing variable and its consequence. It never logs a
value. A missing `GEMINI_API_KEY` disables only the model path; the app does not
crash.

> **Production without Upstash is degraded, deliberately.** If
> `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are missing, or Upstash
> cannot be reached within 1.5 s, then:
>
> - `/api/air` and `/api/geocode` return **503** (`service_unavailable`, generic
>   body, `Retry-After`) — they do **not** serve data unlimited;
> - `/api/plan` returns **HTTP 200** with the labelled rule-based plan
>   (`meta.fallbackReason: "limiter_unavailable"`) and never calls the model;
> - `/api/health` returns **503**, so the smoke test and any uptime monitor see
>   the misconfiguration instead of a green check.
>
> No route is ever left without a rate limit. Development is the only place the
> per-instance in-memory limiter runs, and it prints one startup warning.

### Deployment on Freebuff Sites (Workers)

Secrets are stored in **Sites → Secrets** for each environment, never in a file
in the image. The Worker reads them at request time: `src/lib/env.ts` looks them
up through a dynamic `process.env[name]` so the bundler cannot fold a value into
the deployed script. `APP_ORIGIN` is injected by the platform, so the same build
serves preview and production correctly.

Build the hosted bundle with **no `.env.local` in the tree**. If that file is
present, `next build` will inline its values into the Worker script (they were
shipped that way once). Verify before publishing:

```bash
npm run check:secrets-in-bundle   # fails if any secret value appears in the build
```

Only the four server-side values in the table above are stored as Sites
secrets: `GEMINI_API_KEY`, `GEMINI_MODEL`, `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN`. After changing one, redeploy: secrets are read at
runtime, but the deployment must exist for the environment to serve.

### 3. Post-deploy smoke test

```bash
npm run smoke -- https://your-deployment.vercel.app
# equivalent: scripts/smoke.sh https://your-deployment.vercel.app
```

The script needs no credentials and only reads public responses. It exits non-zero
if any check fails and prints what it actually received:

| Check | Expected |
| --- | --- |
| `GET /` | 200 |
| Security headers on `/` | `Content-Security-Policy` (`default-src 'self'`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (`geolocation=(self)`) |
| `GET /api/health` | 200 with exactly `{"status":"ok"}` |
| `POST /api/plan` with `Origin: https://evil.example` | 403, and no `Access-Control-Allow-Origin` header |
| `GET /sw.js` | 200, skips every `/api/` request, no cache write or precache names `/api` |

A 503 from `/api/health` during the smoke test means the rate limiter is not
configured or not reachable — the deployment is up but refusing to serve API
traffic, which is the intended fail-closed behaviour.

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

## Rate limiting and the Upstash free tier

Rate limiting is the only thing standing between a public endpoint and the
owner's model quota, so it is never optional in production.

| Situation | `/api/plan` | `/api/air`, `/api/geocode` |
| --- | --- | --- |
| Upstash configured and reachable | normal (429 + `Retry-After` when over the limit) | normal |
| Upstash unreachable (timeout 1.5 s) | **200** + labelled fallback, `fallbackReason: "limiter_unavailable"`, no model call | **503** + `Retry-After`, generic message |
| Upstash variables missing, `NODE_ENV=production` | same as above | **503** |
| Upstash variables missing, development | per-instance memory limiter + one startup warning | same |

**Startup configuration check.** `src/instrumentation.ts` calls
`reportEnv()` once per Node.js server instance. It logs a clear error for each
missing required variable — `GEMINI_API_KEY`, `GEMINI_MODEL`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — with the consequence, and
**never logs a value**. A missing `GEMINI_API_KEY` disables only the model path
(every plan becomes the deterministic fallback); the app does not crash.

**Verified client-IP source.** Per Vercel's
[request headers documentation](https://vercel.com/docs/headers/request-headers)
(read November 2026): *"Vercel … overwrite[s] the X-Forwarded-For header and do[es]
not forward external IPs. This restriction is in place to prevent IP spoofing."*
`x-vercel-forwarded-for` is the same value and survives a proxy in front of
Vercel, so it is read first. In production only those Vercel-set headers are
used; a caller-supplied `x-forwarded-for` is ignored. `tests/unit/http.test.ts`
and `tests/unit/productionLimits.test.ts` prove that rotating it in a request
neither resets nor bypasses the limit.

**Upstash free-tier limits** (official docs,
[`upstash.com/docs/redis/overall/pricing`](https://upstash.com/docs/redis/overall/pricing)
and `/billing`, read November 2026): **500,000 commands/month**, 10,000
commands/second, 256 MB (250 MB in the pricing table), one database. Nothing
here needs more than a few bytes per key, so size is irrelevant; the command
count is the limit that matters.

A plan request costs at most **4 commands**: one sliding-window script call for
the per-IP limit, and `INCR` + `EXPIRE` for the daily cap (the `EXPIRE` only on
the first request of the day). `/api/air` and `/api/geocode` cost at most 2 each.
Under normal use — say 100 plan requests plus 400 air/geocode requests a day —
that is about 1,400 commands/day, or **≈43,000/month, under 9% of the free
tier**. The documented default `DAILY_LLM_CAP=200` also caps model spend
independently of traffic.

What the app cannot do is make a *sustained attack* cheap: the per-IP limit is
6 plan requests/minute, so one address hammering the route all month would use
more than 500K commands. Upstash's FAQ states that commands over the free
allowance return an exception; that exception is handled as "limiter
unreachable", so the app degrades to the labelled fallback / 503 instead of
spending money. If you expect that traffic, set a budget alert and move to a
paid Upstash plan — the code needs no change.

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
4. **Rate limiting is mandatory in production.** In a production build,
   `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` must be set and reachable.
   If they are missing or the limiter does not answer within 1.5 s, every route
   fails closed: `/api/plan` answers **200** with the labelled rule-based plan
   (`fallbackReason: "limiter_unavailable"`) and never calls the model, while
   `/api/air` and `/api/geocode` answer **503** with a generic message. No route
   is ever left unlimited. Development uses a per-instance memory limiter and
   says so once at startup.
5. **`/api/plan` re-fetches air data.** A caller cannot supply invented air
   readings to the model. The only exception is the explicit `sample: true` demo
   flag, which is labelled in the response and the UI.
6. **Client IP from Vercel's own headers only.** In production the key comes from
   `x-vercel-forwarded-for`, then `x-real-ip`; both are written by Vercel's edge
   and cannot be set by the caller, so rotating `x-forwarded-for` cannot select a
   new bucket. Outside production, `x-forwarded-for` is accepted as a last resort
   (leftmost entry, the one Vercel documents as the real client), and an
   unparseable address becomes one shared `unknown` bucket. IPs are hashed before
   use as rate-limit keys, so no raw address is stored (`src/lib/http.ts`).
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
src/app/            layout, page, globals.css, API routes (air, geocode, health, plan)
src/components/     client UI (app shell, air panel, chart, profile, plan)
src/lib/            aqi, naqi, geo, schemas, prompt, gemini, planService,
                    fallbackPlan, planContent, i18n, rateLimit, sanitize,
                    security, http, air, indices, client
src/proxy.ts        per-request CSP nonce + security headers (Next 16 name)
public/             manifest.webmanifest, sw.js, generated icons
tests/unit/         Vitest suites (offline)
tests/live/         key-gated live AI tests (real Gemini calls via /api/plan)
tests/e2e/          Playwright smoke tests
scripts/            icon generator, client-bundle secret scan, post-deploy smoke test
```
