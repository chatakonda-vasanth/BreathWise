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
| **S**poofing | Forged client IP to dodge rate limits | IP comes only from `x-vercel-forwarded-for` / `x-real-ip`; rightmost `x-forwarded-for` hop only; unparseable → shared bucket (`src/lib/http.ts`). |
| Spoofing | Cross-site form/script POSTing to `/api/plan` | `Origin` **required** on POST and compared to `APP_ORIGIN`/`Host`; `sec-fetch-site` must be same-origin; no CORS headers are ever emitted; `OPTIONS` → 403. |
| **T**ampering | Passing invented air data to the model | `/api/plan` accepts only profile + coordinates; the snapshot is re-fetched server-side. |
| Tampering | Prompt injection via city names, profile or upstream data | No free-text field exists; all schemas are `strictObject` (unknown keys rejected); prompt data blocks are delimited and labelled untrusted; every upstream string is reduced to a strict character set before entering the prompt. |
| Tampering | XSS via model output or place names | React text nodes only, `react/no-danger` lint rule, no `dangerouslySetInnerHTML` anywhere, `sanitizeText` strips tags/scripts/markdown link targets, CSP with nonces as backstop. |
| Tampering | Malicious model output (medication/dosage/diagnosis) | `looksLikeMedicalAdvice` rejects the whole response → deterministic fallback; medical banner is computed server-side and never taken from the model. |
| Tampering | Service worker poisoning the app | SW caches only same-origin GETs outside `/api/`, only `response.ok && type === 'basic'`, and ignores requests with `Authorization`; cache version bumped on change. |
| **R**epudiation | No audit trail of abuse | Structured minimal logs (route, status, duration, outcome) with no location/profile/IP; intentionally not a personal-data log. |
| **I**nformation disclosure | Key leaking into the browser bundle | Secrets are read only via `process.env` inside route handlers; nothing is `NEXT_PUBLIC_`; `scripts/check-client-bundles.mjs` fails the build if a key value, key shape or server-only variable name appears under `.next/static`. |
| Information disclosure | Stack traces / upstream error bodies | Every route returns one of eight generic codes; upstream bodies are never forwarded; `logEvent` accepts no free-form data. |
| Information disclosure | Location logging | Coordinates are rounded in `normaliseCoords` before any use, never logged, never persisted; the prompt excludes them. |
| Information disclosure | Clickjacking / referrer leakage | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. |
| **D**enial of service | Flooding the paid route | Sliding-window limit per hashed IP (`6/min`) **plus** daily cap in Upstash; limiter calls bounded at 1.5 s; **fail closed** on `/api/plan` when Upstash is unreachable. |
| DoS | Oversized bodies | `readJsonBody` rejects on declared `Content-Length` and on the actual byte length (8 KiB cap). |
| DoS | Slowloris-style outbound hangs | `AbortSignal.timeout(5000)` for Open-Meteo, 20 s for the model, 1.5 s for Redis. |
| **E**levation of privilege | SSRF to cloud metadata endpoints | Hosts are constants (`air-quality-api.open-meteo.com`, `geocoding-api.open-meteo.com`, `generativelanguage.googleapis.com`); query values are validated numbers; `redirect: 'error'`; the model has no tools (`functionCallingConfig.mode = 'NONE'`). |
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
Referrer-Policy, Permissions-Policy (geolocation=(self), everything else off),
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
| Cross-site POST to `/api/plan` | Origin + `sec-fetch-site` enforcement, no CORS | `tests/unit/http.test.ts` (6 origin cases), `tests/e2e/smoke.spec.ts` (cross-origin → 403) |
| IP spoofing to dodge limits | Trusted Vercel headers only, rightmost-hop fallback, hashing | `tests/unit/http.test.ts` (5 IP cases) |
| Unbounded LLM spend | Per-IP sliding window + daily cap + kill switch, fail closed | `tests/unit/rateLimit.test.ts`, `tests/unit/planService.test.ts` (cap, disabled, no key) |
| Limiter outage | `withTimeout(1.5 s)`, fail closed on paid route only | `tests/unit/rateLimit.test.ts` (unreachable limiter → `limiter_unavailable`) |
| Oversized body | 8 KiB cap, declared and actual length | `tests/unit/http.test.ts`, e2e oversized POST → 400/413 |
| Prompt injection | No free text; strict schemas; delimited untrusted blocks; sanitised upstream strings | `tests/unit/prompt.test.ts` (injection in timezone/current time), `tests/unit/schemas.test.ts` (unknown keys rejected) |
| Model returns medication advice | Regex guard → fallback | `tests/unit/sanitize.test.ts`, `tests/unit/planService.test.ts` (`medical_content`) |
| Model returns wrong language | Script ratio check → fallback | `tests/unit/planService.test.ts` (`lang_mismatch`), `tests/unit/sanitize.test.ts` |
| XSS from model/place names | Text-only rendering, sanitisation, CSP | `tests/unit/sanitize.test.ts`, e2e malicious place name renders as text |
| SSRF | Fixed hosts, numeric-only params, `redirect: 'error'` | `tests/unit/air.test.ts` (URL construction, out-of-range coords never fetch) |
| Error leakage | Generic codes only | `tests/unit/planService.test.ts` (403 body not echoed), e2e (no `stack` in body) |
| SW caching personalised data | `/api/` never intercepted | e2e assertion on `sw.js`, plus code review of `public/sw.js` |
| Stale/dangerous AQI maths | Pure functions, unit tested | `tests/unit/aqi.test.ts`, `tests/unit/naqi.test.ts` |
| Unsafe headers | Pure builder, unit tested | `tests/unit/security.test.ts`, e2e header assertions |

## Auditing this project

```bash
npm run lint && npm run typecheck && npm test
npm run build && npm run test:e2e
npm run audit && npm run secrets && npm run check:bundles
```

## Known limitations

1. **Rate limiting without Upstash is per-instance.** If `UPSTASH_REDIS_REST_URL`
   and `_TOKEN` are not set, the limiter is an in-memory map. On serverless that
   is best-effort only. Production must set both. `/api/plan` still fails closed
   once Upstash *is* configured but unreachable; it cannot fail closed when it is
   not configured at all without taking the app offline, which would be worse
   during a smog event. Deployments that require hard guarantees should set the
   variables and monitor `/api/plan` 429/503 rates.
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
6. **Lighthouse's PWA category no longer exists** (removed in Lighthouse 12), so
   installability is verified by inspecting the manifest/SW and Chrome's
   installability criteria rather than a score. Accessibility is measured.
7. **Geolocation requires a secure context.** Over plain HTTP the browser blocks
   it; city search is the documented fallback.
8. **TypeScript is pinned to 6.x** because `typescript-eslint` does not support
   7.0 yet; `tsc` 7 was verified to typecheck the project, but ESLint would not
   start, so the pinned version keeps the whole gate runnable.
9. **The sample snapshot is fabricated** and only used behind an explicit label;
   it must never be mistaken for measurements.
