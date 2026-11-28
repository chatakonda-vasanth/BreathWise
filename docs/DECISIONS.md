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
   use as rate-limit keys, so no raw address is stored (`src/lib/clientIp.ts`).
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
12. **zod is a server dependency only.** The browser validates responses with
    hand-written structural guards (`src/lib/responseGuards.ts`). Rationale: the
    server parses untrusted input and must be strict; the browser only needs to
    refuse a malformed body before rendering it. Saves ~40 KiB of schema runtime
    on a mobile connection, and the same fixtures pin both sides.
13. **Language packs are fetched on demand.** English ships in the first load
    because it defines the key type; Hindi and Telugu are separate chunks loaded
    the first time they are selected. The language switch awaits the pack, so
    "half a page in the old language" cannot happen.
14. **Air data is cached for 10 minutes, in memory, per instance.** Two neighbours
    looking at the same city within a few minutes cost one upstream call. A
    rejected fetch is never cached, so an outage is never outlived by the cache.
    No coordinates or responses are persisted anywhere.
15. **A repeated plan request in the same session does not call the model.**
    Identical profile + language + AQI band + coordinates is served from memory.
    The alternative (regenerating) would spend a rate-limit token to produce the
    same answer.
16. **ESLint complexity limit is 10.** Chosen after measuring: 12 failed
    on routing and origin-check functions whose branches are the security rules
    themselves, and forcing them apart made the checks harder to audit. The
    functions above the limit were split (`generatePlan`, `checkOrigin`,
    `regionalContext`, `whyThisPlanFits`, the plan guards, `AppShell`), and
    `max-depth`/`max-params` stay strict.
17. **zod runs jitless (`z.config({ jitless: true })`).** By default zod probes
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


## How this addresses the problem

The brief: an assistant that helps families and communities navigate severe
winter smog by suggesting low-emission routines, indoor air hacks and sustainable
alternatives tailored to location and lifestyle, while explaining the direct
impact, with every regional or impact claim conservative, labelled and carrying
its assumption.

| Requirement                                                                               | Where it lives                                                                                                                                                          | What proves it                                                                                                                               |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Location tailoring without sending a place to the model                                   | `src/lib/regional.ts` — static coarse-region + season table, browser-only; documented in [`PRIVACY.md`](PRIVACY.md)                                                     | `tests/unit/regional.test.ts` (region/season/burning/inversion cases; asserts `prompt.ts`, `planService.ts` and `gemini.ts` never import it) |
| Lifestyle tailoring, visibly used                                                         | `src/lib/impact.ts` (`whyThisPlanFits`), rendered by `src/components/personal-context.tsx` (`WhyThisPlanFits`) and passed `profile` from `src/components/app-shell.tsx` | `tests/unit/impact.test.ts` (“names every household input that shaped the plan”)                                                             |
| “Why this plan fits you” summary                                                          | `WhyThisPlanFits` card on every plan                                                                                                                                    | `tests/unit/impact.test.ts`; `tests/e2e/flow.spec.ts` asserts the card renders                                                               |
| Direct impact with a deterministic with/without estimate                                  | `compareWithWithout` + `IMPACT_FACTORS` in `src/lib/impact.ts`, rendered by `WithWithoutCard`                                                                           | `tests/unit/impact.test.ts` (AQI 0, 500+, no profile, each budget, each glazing)                                                             |
| “Rough estimate” next to every number, in English, Hindi and Telugu                       | `ImpactLabels.roughEstimate` in `src/lib/impact.ts`, printed beside each value                                                                                          | `tests/unit/impact.test.ts` (“labels the estimate as rough in all three languages”)                                                          |
| Direct Impact block (mechanism, estimate, assumption, confidence) on every recommendation | `Recommendation.impact` in `src/lib/types.ts`; enforced by the response schema and rendered in `src/components/plan-view.tsx`                                           | `tests/unit/schemas.test.ts`, `tests/unit/fallback.test.ts`; `tests/e2e/flow.spec.ts` asserts “Direct impact” on the plan                    |
| Community checklist (school, workplace, resident association, no-burning, carpool)        | `communityItems` in `src/lib/i18n/index.ts`, rendered in “Community mode”                                                                                                     | `tests/unit/keyHygiene.test.ts` (every UI key exists in all three languages); e2e checks the checklist is interactive and shareable          |
| Conservative, labelled regional and impact claims                                         | Every regional note and impact factor states its assumption; see `src/lib/regional.ts`, `src/lib/impact.ts`, `src/lib/fallbackPlan.ts`                                  | `tests/unit/impact.test.ts` (each step has an assumption), `tests/unit/regional.test.ts` (assumption label present)                          |

