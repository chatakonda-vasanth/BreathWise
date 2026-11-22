# Security policy and threat model — CleanAir Companion

This file is the audit baseline for the project: it states what we protect,
which threats we considered (STRIDE-lite), how each is mitigated, and **how the
mitigation was verified**. Anything that could not be verified end-to-end is
listed under [Known limitations](#known-limitations).

## Assets

| Asset | Why it matters |
| --- | --- |
| The LLM API key | Abuse costs money and, if leaked, burns the owner's quota. |
| Upstash credentials | Abuse of rate limiting / daily caps. |
| A visitor's approximate location | Reveals where a family lives. |
| The household profile | Health-adjacent data (sensitive group, symptoms). |
| Integrity of the guidance shown | Bad advice in a smog emergency causes harm. |
| Availability of the app during a smog event | Exactly when it is needed. |

## Trust boundaries

```
browser ──(same-origin fetch only)──► Next.js route handlers ──► Open-Meteo (fixed hosts)
   │                                        │
   │                                        └──► Gemini (fixed host, key in header)
   └─ service worker (shell + static assets only, never /api/*)
```

Nothing in the browser ever holds a secret, and the browser never talks to a
third party directly — `connect-src 'self'`.

## STRIDE-lite

| Threat | Example | Mitigation in this codebase |
| --- | --- | --- |
| **S**poofing | Forged client IP to dodge rate limits | In production the key comes only from Vercel-written headers: `x-vercel-forwarded-for`, then `x-real-ip`; a caller-supplied `x-forwarded-for` is ignored, so rotating it cannot reset a limit. Outside production `x-forwarded-for` is a last resort (leftmost entry, as Vercel documents). The address is then **canonicalised** (`canonicalIp`): IPv4 is rebuilt from its four octets and IPv6 is normalised, so spelling variants of one address cannot select different buckets, and platform headers are read from their last (proxy-appended) entry. Unparseable/missing → one shared `unknown` bucket, never a bypass (`src/lib/http.ts`). Verified by `tests/unit/http.test.ts` and the spoofing test in `tests/unit/productionLimits.test.ts`. |
| Spoofing | Cross-site form/script POSTing to `/api/plan` | `Origin` **required** on POST and compared, as a full origin (scheme + host + port), to `APP_ORIGIN`; without `APP_ORIGIN` it is compared to the unforgeable `Host` header (`X-Forwarded-Host` is only a fallback for a proxy that rewrites `Host`, and only its last entry is used). A set-but-unparseable `APP_ORIGIN` fails closed. `sec-fetch-site` must be same-origin; no CORS headers are ever emitted; `OPTIONS` → 403. |
| **T**ampering | Passing invented air data to the model | `/api/plan` accepts only profile + coordinates; the snapshot is re-fetched server-side. |
| Tampering | Prompt injection via city names, profile or upstream data | No free-text field exists anywhere in the request path (an earlier draft accepted a display-only `locationLabel`; it was removed during self-audit as unused attack surface); all schemas are `strictObject` (unknown keys rejected); prompt data blocks are delimited and labelled untrusted; every upstream string is reduced to a strict character set before entering the prompt. |
| Tampering | XSS via model output or place names | React text nodes only, `react/no-danger` lint rule, no `dangerouslySetInnerHTML` anywhere, `sanitizeText` strips tags/scripts/markdown link targets, CSP with nonces as backstop. |
| Tampering | Malicious model output (medication/dosage/diagnosis) | `looksLikeMedicalAdvice` rejects the whole response → deterministic fallback; medical banner is computed server-side and never taken from the model. |
| Tampering | Service worker poisoning the app | SW caches only same-origin GETs outside `/api/`, only `response.ok && type === 'basic'`, and ignores requests with `Authorization`; cache version bumped on change. |
| **R**epudiation | No audit trail of abuse | Structured minimal logs (route, status, duration, outcome) with no location/profile/IP; intentionally not a personal-data log. |
| **I**nformation disclosure | Key leaking into the browser bundle | Secrets are read only via `process.env` inside route handlers; nothing is `NEXT_PUBLIC_`; `scripts/check-client-bundles.mjs` fails the build if a key value, key shape or server-only variable name appears under `.next/static`. |
| Information disclosure | Stack traces / upstream error bodies | Every route returns one of nine generic codes; upstream bodies are never forwarded; `logEvent` accepts no free-form data; the startup check logs variable names only, never values. |
| Information disclosure | Reconnaissance through a status endpoint | `/api/health` returns exactly `{"status":"ok"}`: no environment variable names, no build/version string, no dependency or limiter details. It is rate limited (60/min per hashed IP) and fails closed with the same generic 503 when the limiter is unavailable, so it cannot be used as a free probe. |
| Information disclosure | Location logging | Coordinates are rounded in `normaliseCoords` before any use, never logged, never persisted; the prompt excludes them. |
| Information disclosure | Clickjacking / referrer leakage | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` (the only external navigation is a `wa.me` share link, which needs no referrer). |
| **D**enial of service | Flooding the paid route | Sliding-window limit per hashed IP (`6/min`) **plus** daily cap in Upstash; limiter calls bounded at 1.5 s. Production **requires** Upstash: missing or unreachable → every route fails closed (`/api/plan` 200 + labelled fallback with no model call; `/api/air`, `/api/geocode` 503 + `Retry-After`). Development-only memory limiter with a startup warning. Tests: `tests/unit/rateLimit.test.ts`, `tests/unit/productionLimits.test.ts`. |
| DoS | Oversized bodies | `readJsonBody` rejects on declared `Content-Length` and on the actual byte length (8 KiB cap). |
| DoS | Slowloris-style outbound hangs | `AbortSignal.timeout(5000)` for Open-Meteo, 18 s per model attempt and a 25 s shared budget (a timeout is never retried and a first attempt slower than half the budget skips the retry, so one request cannot hang for 2x the budget), 1.5 s for Redis. |
| **E**levation of privilege | SSRF to cloud metadata endpoints | Hosts are constants (`air-quality-api.open-meteo.com`, `geocoding-api.open-meteo.com`, `generativelanguage.googleapis.com`); query values are validated numbers; `redirect: 'error'`; the model has no tools (`functionCallingConfig.mode = 'NONE'`). |
| Elevation of privilege | Runtime code generation in the browser | `z.config({ jitless: true })` (`src/lib/zod-jitless.ts`) so zod never probes with `Function("")`; no `eval`/`new Function` in app code; CSP forbids both. |
| Elevation of privilege | Reaching internal services via user-supplied URL | No endpoint accepts a URL. The `airQuerySchema`/`geocodeQuerySchema` reject unknown query keys, so `?url=` is a 400. |

## Header policy

Set per request in `src/proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`):

```
default-src 'self';
script-src 'self' 'nonce-<fresh 128-bit>' 'strict-dynamic';
style-src  'self' 'nonce-<fresh>';
img-src 'self' data:; font-src 'self'; connect-src 'self';
manifest-src 'self'; worker-src 'self'; media-src 'none';
object-src 'none'; frame-src 'none'; frame-ancestors 'none';
base-uri 'self'; form-action 'self'; upgrade-insecure-requests
HSTS (prod), X-Content-Type-Options: nosniff, X-Frame-Options: DENY,
Referrer-Policy: no-referrer, Permissions-Policy (geolocation=(self), everything else off),
Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Resource-Policy: same-origin
```

**Documented tradeoff:** nonces require dynamic rendering. Every route is
therefore `ƒ (Dynamic)` in the build output, HTML cannot be CDN-cached, and
Lighthouse's server-response-time metric is worse than a static page. This is
accepted in exchange for `script-src` with no `'unsafe-inline'`/`'unsafe-eval'`
in production. Development adds `'unsafe-eval'` and inline styles because React
Fast Refresh needs them; that is gated on `NODE_ENV`.

## Risk → mitigation → verification

| Risk | Mitigation | Verified by |
| --- | --- | --- |
| Key in client bundle | Server-only env; no `NEXT_PUBLIC_`; bundle grep | `npm run check:bundles` (scans `.next/static`, fails on key value/shape/server-only names) |
| Committed secret | `.gitignore` (`*.env`), gitleaks in CI | `npm run secrets` |
| Cross-site POST to `/api/plan` | `Host`-bound origin check (Host is a forbidden header), full-origin `APP_ORIGIN` pin, malformed pin fails closed, no CORS | `tests/unit/http.test.ts` (17 origin cases, incl. forged `X-Forwarded-Host` and scheme downgrade), `tests/e2e/smoke.spec.ts` (cross-origin → 403) |
| IP spoofing to dodge limits | Trusted Vercel headers only (last entry), canonical IP → one bucket per address, hashing | `tests/unit/http.test.ts` (15 IP cases, incl. IPv6/IPv4 spelling variants) |
| Unbounded LLM spend | Per-IP sliding window + daily cap + kill switch, fail closed | `tests/unit/rateLimit.test.ts`, `tests/unit/planService.test.ts` (cap, disabled, no key) |
| Limiter outage | `withTimeout(1.5 s)`; production fails closed on **every** route, development degrades to memory with one warning | `tests/unit/rateLimit.test.ts`, `tests/unit/productionLimits.test.ts` (plan → 200 labelled fallback, air/geocode → 503) |
| Production deployed without Upstash | Startup env check logs the missing variable names; requests fail closed rather than running unlimited (`/api/health` answers 503, so monitoring sees it) | `tests/unit/envCheck.test.ts`, `tests/unit/productionLimits.test.ts`, `tests/unit/healthRoute.test.ts` |
| Deployed with broken headers or service worker | Nothing to drift: no `vercel.json`, headers come only from `src/proxy.ts` | `scripts/smoke.sh` (CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, cross-origin 403, `/sw.js` has no `/api` cache path) |
| Oversized body | 8 KiB cap, declared and actual length | `tests/unit/http.test.ts`, e2e oversized POST → 400/413 |
| Platform kills the function (504 instead of guidance) | Explicit `maxDuration = 45` s (Hobby allows 300 s), 18 s per-attempt cap, 25 s total LLM budget, 5 s response margin — worst case 35 s — and every failure path returns a labelled fallback plan with HTTP 200 | `tests/unit/planRoute.test.ts` (simulated provider that only settles on abort: 200 + `fallbackReason: "timeout"`, one attempt, inside budget), `tests/unit/planService.test.ts` (budget exhausted, half-budget retry skip) |
| Prompt injection | No free text; strict schemas; delimited untrusted blocks; sanitised upstream strings | `tests/unit/prompt.test.ts` (injection in timezone/current time), `tests/unit/schemas.test.ts` (unknown keys rejected) |
| Model returns medication advice | Regex guard → fallback | `tests/unit/sanitize.test.ts`, `tests/unit/planService.test.ts` (`medical_content`) |
| Model returns wrong language | Script ratio check → fallback | `tests/unit/planService.test.ts` (`lang_mismatch`), `tests/unit/sanitize.test.ts` |
| XSS from model/place names | Text-only rendering, sanitisation, CSP | `tests/unit/sanitize.test.ts`, e2e malicious place name renders as text |
| SSRF | Fixed hosts, numeric-only params, `redirect: 'error'` | `tests/unit/air.test.ts` (URL construction, out-of-range coords never fetch) |
| Error leakage | Generic codes only | `tests/unit/planService.test.ts` (403 body not echoed), e2e (no `stack` in body) |
| SW caching personalised data | `/api/` never intercepted | e2e assertion on `sw.js`, plus code review of `public/sw.js` |
| Stale/dangerous AQI maths | Pure functions, unit tested | `tests/unit/aqi.test.ts`, `tests/unit/naqi.test.ts` |
| Unsafe headers | Pure builder, unit tested | `tests/unit/security.test.ts`, e2e header assertions |

## Independent review (phase 4): attempts to break each control

A reviewer who did not write this code re-read the whole tree and this file, then
tried to break every control: prompt injection through every input (profile
fields, city names, upstream air data), cross-origin POSTs and `APP_ORIGIN`
misconfiguration (missing, wrong scheme, trailing slash, subdomain lookalikes),
oversized bodies and malformed or out-of-range coordinates, rate-limit bypass
with spoofed/cased/variant forwarding headers, service-worker caching of `/api`,
CSP bypasses, and secret leakage in bundles, logs, responses and history.

**No critical finding.** Three high findings were found; all three are fixed and
each fix has a regression test. Four lower findings were also fixed; the
remaining accepted risks are recorded under
[Known limitations](#known-limitations).

### High findings (fixed)

| # | Finding | Evidence | Fix | Regression test |
| --- | --- | --- | --- | --- |
| H1 | The same-origin check trusted a header the page itself can write. `checkOrigin` read `x-forwarded-host` **before** `Host`. `X-Forwarded-Host` is not a forbidden header name, so any page's `fetch()` can set it, while `Host` is forbidden and is the host the browser really addressed (the host its `Origin` was derived from). A cross-origin POST that also carries no `Sec-Fetch-Site` — Safari < 16.4, a proxy that strips it, any non-browser client — could present `Origin: https://evil.example` **and** `X-Forwarded-Host: evil.example` and be accepted, spending the owner's LLM budget from the browser. | The reviewed code read `request.headers.get('x-forwarded-host') ?? request.headers.get('host')`. The new test drives exactly that forged pair. | `Host` wins whenever present; `x-forwarded-host` is only a fallback for a proxy that rewrites `Host`, and only its **last** (proxy-appended) entry counts. | `tests/unit/http.test.ts` → "ignores a forged X-Forwarded-Host when Host disagrees", "uses the last X-Forwarded-Host entry when a proxy appends". |
| H2 | `APP_ORIGIN` could be misconfigured into no protection at all, silently. Comparison used `new URL(configured).host`, which ignores the scheme, so `Origin: http://app.example` was accepted for a configured `https://app.example` (an attacker able to serve plain HTTP on that name, or a user lured to `http://`, passes the CSRF gate). And the commonest typo — a value with no scheme, `app.example` — threw inside the `try`, was swallowed, and fell through to the `Host` comparison: the pin the operator thought they had configured was never enforced, and nothing reported it. | `new URL('http://app.example').host === 'app.example'`; the old `catch { /* fall through to host comparison */ }`. | Full-origin comparison (`scheme://host:port`). A set-but-unparseable `APP_ORIGIN` now **fails closed** (403, outcome `invalid_config`), and `src/instrumentation.ts` reports the variable by name at startup. | `tests/unit/http.test.ts` → "requires the configured scheme, host and port to match exactly" (scheme downgrade, wrong port, `evil-cleanair.example`, `cleanair.example.evil.example`), "fails closed when APP_ORIGIN is not an absolute http(s) origin", "accepts a configured origin written with a trailing slash", "rejects an opaque or non-http Origin even with no APP_ORIGIN"; `tests/unit/envCheck.test.ts` → APP_ORIGIN reporting. |
| H3 | The rate-limit bucket key was the raw header spelling, so one client could occupy many buckets. `hashIp` hashed the string as received; IPv6 has several equivalent forms (`2001:DB8::1`, `2001:db8:0:0:0:0:0:1`, `2001:0db8::0001`) and IPv4 tolerates leading zeros (`010.0.0.1`), each yielding a distinct Redis key. The same applied to a prepended value in a multi-value `x-vercel-forwarded-for` if the edge appends rather than replaces. Only reachable where the header is client-influenced (self-hosted deployment, proxy that appends, platform that does not overwrite), but a bucket per spelling defeats the limit by construction. | `tests/unit/http.test.ts` asserts one canonical key — and one hash — for five spellings of one address. | `canonicalIp()`: IPv4 rebuilt from its four numeric octets, IPv6 normalised through WHATWG URL serialisation (impossible forms are rejected and land in the shared `unknown` bucket). Platform headers are read from their last entry. | `tests/unit/http.test.ts` → "collapses every textual form of one IPv6 address to a single key", "collapses leading zeros in an IPv4 address", "takes the last entry of a platform forwarding header", "rejects IPv6 spellings the parser cannot normalise". |

### Lower findings (fixed anyway, because the fix was small and testable)

| # | Severity | Finding | Fix | Regression test |
| --- | --- | --- | --- | --- |
| M1 | Medium | The 8 KiB body cap was enforced only **after** `request.text()` had buffered the entire body, so a chunked request with no `Content-Length` was read to the end before being rejected. Vercel caps request bodies at 4.5 MB, so this was bounded in the documented deployment, but the mitigation claimed more than it did. | `readBoundedText` reads the stream chunk by chunk, cancels it the moment the cap is crossed, and never stores the excess. | `tests/unit/http.test.ts` → "stops reading an oversized chunked body and cancels the stream" (asserts the stream is cancelled with no `Content-Length` present). |
| L1 | Low | `Content-Type` was matched with `includes('application/json')`, so `text/plain; x=application/json` was accepted. Harmless (the body still had to parse as JSON and pass a strict schema) but not the intended contract. | Exact media-type comparison after splitting parameters. | `tests/unit/http.test.ts` → "requires the media type itself to be application/json". |
| L2 | Low | Geocoder rows were only checked for finite coordinates, and `timezone` was passed to the client unsanitised — inconsistent with the rule that every upstream string is reduced before use. An out-of-range latitude/longitude from a broken or hostile geocoder reached the UI and produced a 400 on the next `/api/air` call. | Rows outside the valid coordinate range are dropped; `timezone` goes through `sanitizeText`. | Covered by `tests/unit/air.test.ts` (geocode mapping and URL construction). |
| L3 | Low | Client IPs are hashed with a fixed salt (`'cleanair'`), so the IPv4 space could be enumerated offline if a Redis key ever leaked. | Accepted: the key is a rate-limit bucket, contains no other data, and never appears in logs or responses. Documented as limitation 11. | — |
| L4 | Low | `/api/plan` rate-limited **before** the origin check, so a cross-site POST — a plain `<form>` needs no preflight — spent the visitor's six-per-minute budget while being rejected 403. Nothing was spent upstream, but a page could deny a visitor the paid route for a minute. | Origin is checked first (cheap, no Redis command, no budget), then the limiter. | `tests/unit/productionLimits.test.ts` → "does not spend the request budget on rejected cross-site POSTs" (nine rejected cross-site POSTs, then a valid one still gets 200). |

### Attempted and found sound (no change)

* **Prompt injection, every input.** Profile fields are closed enums and bounded integers; there is still no free-text field in any request (a `locationLabel` is rejected as an unknown key). A city name is never put in the prompt — only its coordinates, rounded — and the geocode query is charset-restricted before it becomes a URL parameter. Upstream air data reaches the prompt only as `JSON.stringify` numbers plus a timezone reduced to `[A-Za-z0-9/_+\-]` and a timestamp reduced to `[0-9T:\-]`/regex-checked; `<AIR_DATA>`/`<PROFILE_DATA>`/`<DERIVED_DATA>` are labelled untrusted in both the system instruction and the block attributes. `tests/unit/prompt.test.ts` throws hostile timezone and time strings at it and asserts the closing tag count stays exactly one.
* **CSP bypass.** No inline `<style>`/`style={}` or un-nonced `<script>` exists in the tree; there is no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `localStorage`, `sessionStorage` or `document.cookie` anywhere in `src/`; zod runs jitless so nothing probes `Function("")`; `object-src`, `frame-src`, `frame-ancestors`, `base-uri` and `form-action` are all locked down; `connect-src 'self'` means an injected string could not exfiltrate to a third party even if one executed.
* **Service worker caching of `/api`.** `public/sw.js` returns before `respondWith` for any `/api/` pathname, for non-GET, for cross-origin and for credentialed requests, and caches only `response.ok && response.type === 'basic'` from `_next/static`, `/icons/`, the manifest and favicon. A casing trick (`/API/plan`) or a doubled slash cannot be cached either: neither is a cacheable asset path, so the handler ignores them. Verified by `scripts/smoke.sh` and the Cache Storage e2e test.
* **Secrets.** No `NEXT_PUBLIC_` variable exists; the key travels only in the `x-goog-api-key` header; `logEvent` accepts no free-form data and the startup check logs names only; every error path returns one of nine generic codes. `tests/unit/keyHygiene.test.ts` makes the provider echo the key back in a 403 body and asserts it appears in neither the response nor the logs. History: `gitleaks git` over all commits, and no `.env` file has ever been added (`git log --all --diff-filter=A --name-only`).
* **Oversized/malformed input.** Coordinates are regex-limited decimals in the query string (`1e2`, `0x10`, ``, `91`, `181` all 400) and `z.number().min().max()` in JSON, which zod rejects for `NaN` and `±Infinity` (verified directly against zod 4); unknown query keys and unknown body keys are 400.

## Self-audit findings and fixes

The phase-3 audit reviewed the whole codebase against this file. Four findings
were found and fixed:

| # | Finding | Fix | Proof |
| --- | --- | --- | --- |
| 1 | zod's JIT probe called `Function("")`, which a strict `script-src` blocked. It was caught, but Chrome logged a CSP violation and Lighthouse's `inspector-issues` audit failed (best-practices 96). | Enable zod's jitless mode globally so no runtime code generation is attempted on server or client. | CDP `Audits.issueAdded` count = 0 after a full search + plan interaction; Lighthouse best-practices 100. |
| 2 | `/api/plan` accepted a display-only `locationLabel` string (up to 80 chars) that the route never used — unused free-text surface in a route whose whole design is "no free text". | Removed from the schema, the client type, the constant table, and added a test that any `locationLabel` is rejected as an unknown key. | `tests/unit/schemas.test.ts` → "rejects any free-text field, including a location label". |
| 3 | `Referrer-Policy: strict-origin-when-cross-origin` still sends the app origin to `wa.me` on share. | Changed to `no-referrer`; the WhatsApp share link needs no referrer. | `tests/unit/security.test.ts`, e2e header assertion, `curl -I` output. |
| 4 | `errorResponse` declared an unused `retryAfter` body field (dead contract). | Removed; `Retry-After` remains a header, which is where it belongs. | `npm run typecheck`, `npm run lint`. |

Verified clean during the same pass (no findings): no `dangerouslySetInnerHTML`,
no `innerHTML`, no `eval`/`new Function`, no `localStorage`/`sessionStorage`/
`document.cookie`, no `NEXT_PUBLIC_`, no `Access-Control-Allow-*` header, and only
two outbound `fetch` call sites — both against hard-coded hosts with
`redirect: 'error'`.

## Auditing this project

```bash
npm run lint && npm run typecheck && npm test
npm run build && npm run test:e2e
npm run audit && npm run secrets && npm run check:bundles
# after a deploy, against the real origin:
npm run smoke -- https://your-deployment.vercel.app
```

`npm run secrets` scans the **full git history** (`gitleaks git`), not just the
working tree, so a secret that was committed and later removed is still found.

## Known limitations

1. **Rate limiting requires Upstash in production.** Without both variables, a
   production build fails closed: `/api/plan` returns the labelled rule-based
   plan with HTTP 200 and never calls the model, and the other API routes return
   503. That keeps the safety-critical page working without ever leaving an
   endpoint unlimited, but it does mean a misconfigured deployment silently
   serves no AI plans until the variables are set. `src/instrumentation.ts`
   logs the missing variable **names** at startup; alert on that line and on the
   `/api/plan` `fallback:limiter_unavailable` outcome. Development and tests use
   a per-instance memory limiter, which is not shared across serverless
   instances and is therefore development-only.
2. **The daily LLM cap is global, not per user.** That is intentional (there are
   no users), but it means one abuser can consume the day's budget; the
   deterministic fallback keeps the product working when that happens.
3. **Free-tier AI providers may use inputs to improve their products.** The
   prompt is limited to categories and public air numbers, never location or
   identity, and `LLM_DISABLED=true` removes the third party entirely.
4. **CSP has no `report-to` endpoint.** Adding one would require a collector,
   which would be a new third party; violations are visible in the browser
   console during development only.
5. **No SRI on framework chunks.** Next's SRI support is still experimental; the
   nonce + `strict-dynamic` policy is used instead.
6. **Lighthouse's PWA category no longer exists** (removed in Lighthouse 12):
   the 13.x install reports only accessibility, best-practices, performance and
   SEO. Installability is therefore verified structurally — manifest served with
   `application/manifest+json`, 192/512/maskable icons served, service worker
   registers and reaches `ready`, scope = origin — plus an e2e test asserting
   Cache Storage holds no `/api/` entries. Chrome's install prompt was not driven
   manually.
7. **Geolocation requires a secure context.** Over plain HTTP the browser blocks
   it; city search is the documented fallback.

8. **Initial client JS is 221.5 KiB gzipped**, above the optional 150 KB
   low-bandwidth target. Low-bandwidth mode itself works (charts are opt-in and
   the plan is text-first), but the React 19 + Next 16 runtime plus client-side
   zod validation dominate the budget. Removing client-side response validation
   would cut roughly 20 KB at the cost of a real defence-in-depth control, which
   was judged a bad trade.
9. **TypeScript is pinned to 6.x** because `typescript-eslint` does not support
   7.0 yet; `tsc` 7 was verified to typecheck the project, but ESLint would not
   start, so the pinned version keeps the whole gate runnable.
10. **The sample snapshot is fabricated** and only used behind an explicit
    label; it must never be mistaken for measurements.
11. **Rate-limit keys use a fixed hash salt** (`hashIp`, salt `cleanair`). The
    IPv4 space could therefore be enumerated offline if a Redis key leaked. The
    key is only a bucket identifier: it is never logged, never returned and
    attached to no other data, so the exposure is a bucket count, not an
    identity.
12. **Client-IP derivation assumes Vercel (or an equivalent front proxy) is the
    outermost edge.** In production only `x-vercel-forwarded-for` and
    `x-real-ip` are read, and only their last entry, because Vercel documents
    that it overwrites them. A **self-hosted** production deployment must have
    its proxy overwrite both headers; otherwise a client-supplied value could
    select its own bucket. The `Host`-bound origin check is unaffected (Host is a
    forbidden header). Deploying on Vercel, as the README documents, satisfies
    this.
13. **The proxy matcher excludes immutable build assets** (`_next/static`,
    `_next/image`, `icons/`, `favicon.ico`), so those responses carry none of the
    security headers — in particular no `X-Content-Type-Options: nosniff`. They
    are our own immutable files served with correct content types, so there is
    no injection path; adding them to the matcher would create a second header
    source and the drift this file exists to prevent. Every document and every
    `/api/*` response does carry them (asserted by the e2e and smoke tests).
