## Environment variables

See `.env.example`. All secrets are **server-only**; nothing is prefixed
`NEXT_PUBLIC_`, because a `NEXT_PUBLIC_` value is compiled into the browser
bundle by definition.

| Variable                   | Required             | Purpose                                                                                                                                                                                                                                                                        |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GEMINI_API_KEY`           | no                   | Server-side LLM key. Unset → fallback plans only.                                                                                                                                                                                                                              |
| `GEMINI_MODEL`             | yes (recommended)    | Model id, default `gemini-3.5-flash`. Changing models needs no code change. The startup check names it if missing, so production never depends on an implicit default.                                                                                                         |
| `LLM_DISABLED`             | no                   | `true` → kill switch; no outbound AI call at all.                                                                                                                                                                                                                              |
| `DAILY_LLM_CAP`            | no                   | Daily generation cap, default 200 (counter in Upstash).                                                                                                                                                                                                                        |
| `LLM_ATTEMPT_TIMEOUT_MS`   | no                   | Lower the per-attempt AI timeout. Clamped to 18000, so it can only be tightened.                                                                                                                                                                                               |
| `UPSTASH_REDIS_REST_URL`   | **yes (production)** | Distributed rate limiting. Without it production refuses to spend: `/api/plan` returns the labelled fallback plan, the other API routes return 503.                                                                                                                            |
| `UPSTASH_REDIS_REST_TOKEN` | **yes (production)** | Same — both are needed.                                                                                                                                                                                                                                                        |
| `APP_ORIGIN`               | prod                 | Exact origin (`scheme://host[:port]`) for same-origin checks, e.g. `https://cleanair.example`. Must include the scheme: a value that is not an absolute http(s) origin is reported at startup and makes every `POST /api/plan` return 403. Unset → the request `Host` is used. |

---



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

| Variable                   | Required              | Safe example value                       | Purpose                                                                                                                                                                                                                                        |
| -------------------------- | --------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UPSTASH_REDIS_REST_URL`   | **yes in production** | `https://example-12345.upstash.io`       | Distributed rate limiting and the daily LLM counter.                                                                                                                                                                                           |
| `UPSTASH_REDIS_REST_TOKEN` | **yes in production** | `replace-with-the-upstash-rest-token`    | Same database; both are needed.                                                                                                                                                                                                                |
| `GEMINI_MODEL`             | **yes**               | `gemini-3.5-flash`                       | Model id, no `models/` prefix. Kept in the environment so a model change needs no redeploy of code.                                                                                                                                            |
| `GEMINI_API_KEY`           | recommended           | `replace-with-your-google-ai-studio-key` | Server-side LLM key. Unset → deterministic plans only; the app still works.                                                                                                                                                                    |
| `LLM_DISABLED`             | no (default `false`)  | `true`                                   | Kill switch: `true` disables every outbound AI call and serves the labelled rule-based plan.                                                                                                                                                   |
| `DAILY_LLM_CAP`            | no (default `200`)    | `200`                                    | Daily LLM generation cap, counted in Upstash. A spend control independent of traffic.                                                                                                                                                          |
| `APP_ORIGIN`               | **yes in production** | `https://cleanair-companion.vercel.app`  | Exact origin for the same-origin check, scheme included (`scheme://host[:port]`). Without it the request `Host` is used. A malformed value is reported by `reportEnv()` and every `POST /api/plan` answers 403 — fail closed, never fail open. |
| `LLM_ATTEMPT_TIMEOUT_MS`   | no (default `18000`)  | `18000`                                  | Optional tightening of the per-attempt AI timeout. Clamped to 18000, so it can only be lowered.                                                                                                                                                |

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

| Check                                                | Expected                                                                                                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`                                              | 200                                                                                                                                                                                           |
| Security headers on `/`                              | `Content-Security-Policy` (`default-src 'self'`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (`geolocation=(self)`) |
| `GET /api/health`                                    | 200 with exactly `{"status":"ok"}`                                                                                                                                                            |
| `POST /api/plan` with `Origin: https://evil.example` | 403, and no `Access-Control-Allow-Origin` header                                                                                                                                              |
| `GET /sw.js`                                         | 200, skips every `/api/` request, no cache write or precache names `/api`                                                                                                                     |

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

| Value                  | Where                       | Why                                                                                                                                                                                           |
| ---------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxDuration = 45` s   | `src/app/api/plan/route.ts` | Explicit, far below the 300 s Hobby ceiling, so a hung request can never sit for minutes.                                                                                                     |
| Air fetch ≤ 5 s        | `UPSTREAM_TIMEOUT_MS`       | Open-Meteo runs before the model and counts against the same clock.                                                                                                                           |
| One LLM attempt ≤ 18 s | `LLM_ATTEMPT_TIMEOUT_MS`    | Measured live latency is 10.1 s (en), 10.8 s (hi), 13.2 s (te); 18 s leaves ~5 s of headroom over the slowest language.                                                                       |
| All attempts ≤ 25 s    | `LLM_TOTAL_BUDGET_MS`       | Two 18 s attempts cannot fit, so the shared deadline caps the second one at the time actually left. 25 s is also the ceiling the UI quotes, so the promise and the budget cannot drift apart. |
| Response margin 5 s    | `ROUTE_RESPONSE_MARGIN_MS`  | Time to serialise the JSON and write the response before the platform kill.                                                                                                                   |

Worst case: 5 + 25 + 5 = **35 s**, inside `maxDuration = 45`, with 10 s left for
cold start and scheduling jitter. (The previous 30 s LLM budget gave a 40 s worst
case; it was tightened to 25 s so the LLM can never consume most of the
function's allowance.)

**Retry rule.** A retry only runs when the first attempt finished inside _half_
the LLM budget (12.5 s of 25 s). A slower first attempt — a hang near the 18 s cap,
or a slow answer that then failed validation — breaks the loop and returns the
labelled fallback immediately, because a second attempt could no longer finish
before the deadline. Timeouts, rate limits and a rejected key are never retried
at all. The route also passes its _remaining_ wall clock to `generatePlan`, which
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

| Situation                                        | `/api/plan`                                                                         | `/api/air`, `/api/geocode`               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------- |
| Upstash configured and reachable                 | normal (429 + `Retry-After` when over the limit)                                    | normal                                   |
| Upstash unreachable (timeout 1.5 s)              | **200** + labelled fallback, `fallbackReason: "limiter_unavailable"`, no model call | **503** + `Retry-After`, generic message |
| Upstash variables missing, `NODE_ENV=production` | same as above                                                                       | **503**                                  |
| Upstash variables missing, development           | per-instance memory limiter + one startup warning                                   | same                                     |

**Startup configuration check.** `src/instrumentation.ts` calls
`reportEnv()` once per Node.js server instance. It logs a clear error for each
missing required variable — `GEMINI_API_KEY`, `GEMINI_MODEL`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — with the consequence, and
**never logs a value**. A missing `GEMINI_API_KEY` disables only the model path
(every plan becomes the deterministic fallback); the app does not crash.

**Verified client-IP source.** Per Vercel's
[request headers documentation](https://vercel.com/docs/headers/request-headers)
(read November 2026): _"Vercel … overwrite[s] the X-Forwarded-For header and do[es]
not forward external IPs. This restriction is in place to prevent IP spoofing."_
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

What the app cannot do is make a _sustained attack_ cheap: the per-IP limit is
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
