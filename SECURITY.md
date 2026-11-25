# Security policy and threat model — CleanAir Companion

This is the audit baseline: what we protect, which threats were considered
(STRIDE-lite), how each is mitigated, **which file holds the control**, **which
test proves it** and **the exact command to reproduce that proof**. Anything that
could not be verified in this environment is listed under
[Not verified here](#not-verified-here) instead of being implied.

Last independent, attacker-style review: **November 2026**, against the tree at
the commit that contains this file.

## Assets

| Asset | Why it matters |
| --- | --- |
| The LLM API key | Abuse costs the owner money and burns quota. |
| Upstash credentials | Abuse of rate limiting and the daily cap. |
| Approximate location | Reveals where a family lives. |
| Household profile | Health-adjacent (sensitive group, symptoms, pregnancy). |
| Integrity of the guidance | Bad advice during a smog emergency causes harm. |
| Availability during a smog event | Exactly when the app is needed. |

## Trust boundaries

```
browser ──(same-origin fetch only)──► Next.js route handlers ──► Open-Meteo (fixed hosts)
   │                                        │
   │                                        └──► Gemini (fixed host, key in header)
   └─ service worker (shell + static assets only, never /api/*)
```

No secret ever reaches the browser, and the browser never talks to a third party
directly (`connect-src 'self'`). The regional-context and with/without layers run
entirely in the browser and are never added to a model prompt.

## Findings from this review

| # | Severity | Finding | Fix | Proof |
| --- | --- | --- | --- | --- |
| 1 | **High** | Eight high-severity advisories in transitive build tooling: `glob` (command injection, cancellation bypass), `sharp`/`undici` via `wrangler`→`miniflare`, `minimatch` (ReDoS). Present in `npm audit` at review time. | Upgraded `wrangler` to 4.168.0 and `@opennextjs/cloudflare` to 1.20.18; pinned patched transitive versions with `overrides` (`glob@14.0.6`, `minimatch@11.0.9`, `sharp@0.35.5`); all direct versions pinned exactly. | `npm audit --audit-level=low` → `found 0 vulnerabilities` (run in CI on every push) |
| 2 | Low | No `/.well-known/security.txt`, so a researcher had no machine-readable contact. | Added the route with a clearly marked placeholder contact (`REPLACE_WITH_MY_EMAIL`); no address invented. | `npx vitest run tests/security/securityTxt.test.ts` |
| 3 | Low | Attack-focused tests were interleaved with feature tests, making the security evidence hard to audit. | Moved them to `tests/security/` and added `npm run test:security`. | `npm run test:security` → 9 files, 83 tests |
| 4 | Informational | The new regional/impact layers could in principle reintroduce place data into the prompt. | They are client-only and the prompt builder does not import them. | `npx vitest run tests/unit/regional.test.ts` (asserts no import in `prompt.ts`, `planService.ts`, `gemini.ts`) |

**No critical finding.** Findings 1–3 are fixed with the proof above. Accepted
risk is recorded under [Known limitations](#known-limitations).

## Risk → control → file → test → command

| Risk | Control | File | Test that proves it | Command to reproduce |
| --- | --- | --- | --- | --- |
| Cross-site POST to `/api/plan` | `Origin` required on POST, compared as a full origin to `APP_ORIGIN`, else to the unforgeable `Host`; `sec-fetch-site` must be same-origin; no CORS headers; `OPTIONS` → 403 | `src/lib/http.ts` (`checkOrigin`), `src/app/api/plan/route.ts` | `tests/security/http.test.ts` (origin cases incl. forged `X-Forwarded-Host`, scheme downgrade, malformed pin) | `npx vitest run tests/security/http.test.ts` |
| `APP_ORIGIN` typo silently allows requests | A set-but-unparseable value fails closed (403) and is reported at startup by name only | `src/lib/envCheck.ts`, `src/lib/http.ts` | `tests/unit/envCheck.test.ts`, `tests/security/http.test.ts` | `npx vitest run tests/unit/envCheck.test.ts` |
| Rate-limit bypass by header spoofing | In production the IP comes only from `x-vercel-forwarded-for` / `x-real-ip`; `x-forwarded-for` is ignored; addresses canonicalised so IPv6/IPv4 spelling variants share one bucket; unparseable → one shared bucket | `src/lib/http.ts` (`getClientIp`, `canonicalIp`, `hashIp`) | `tests/security/http.test.ts` (spoofing + IPv6 forms) | `npx vitest run tests/security/http.test.ts` |
| Unlimited LLM spend | Per-IP sliding window + daily cap; fail closed without Upstash | `src/lib/rateLimit.ts`, `src/app/api/plan/route.ts` | `tests/unit/rateLimit.test.ts`, `tests/security/productionLimits.test.ts` | `npm test` |
| Limiter outage | Bounded at 1.5 s; production fails closed on every route (`/api/plan` → 200 labelled fallback, no model call; `/api/air`, `/api/geocode` → 503 + `Retry-After`) | `src/lib/rateLimit.ts`, `src/lib/planService.ts` | `tests/security/productionLimits.test.ts`, `tests/e2e/flow.spec.ts` (limiter-unavailable path) | `npm run test:security` |
| Oversized or chunked body | 8 KiB cap enforced on the declared length and while streaming; the stream is cancelled at the cap | `src/lib/http.ts` (`readBoundedText`, `readJsonBody`) | `tests/security/http.test.ts`, `tests/unit/branches.test.ts`, e2e oversized POST | `npx vitest run tests/security/http.test.ts` |
| Prompt injection through any input | No free-text field exists; strict schemas reject unknown keys; upstream strings reduced to a strict character set; data blocks delimited and labelled untrusted | `src/lib/schemas.ts`, `src/lib/prompt.ts` | `tests/security/prompt.test.ts`, `tests/security/http.test.ts`, `tests/unit/schemas.test.ts` | `npx vitest run tests/security/prompt.test.ts` |
| XSS through model output or place names | React text nodes only, `react/no-danger`, `sanitizeText`, nonce CSP as backstop | `src/lib/sanitize.ts`, `src/components/*.tsx`, `src/lib/security.ts` | `tests/security/sanitize.test.ts`, e2e malicious place name | `npx vitest run tests/security/sanitize.test.ts` |
| Model returns medication/dosage/diagnosis | Regex guard rejects the plan → deterministic fallback | `src/lib/sanitize.ts` (`looksLikeMedicalAdvice`), `src/lib/planService.ts` | `tests/security/sanitize.test.ts`, `tests/unit/planService.test.ts` | `npx vitest run tests/security/sanitize.test.ts` |
| Model returns the wrong language | Script check → fallback | `src/lib/sanitize.ts` (`scriptMatches`) | `tests/security/sanitize.test.ts` | `npx vitest run tests/security/sanitize.test.ts` |
| SSRF to internal services | Hosts are constants; only validated numbers enter a URL; `redirect: 'manual'` and every 3xx rejected; no endpoint accepts a URL (unknown query keys → 400) | `src/lib/constants.ts`, `src/lib/air.ts`, `src/lib/gemini.ts` | `tests/unit/air.test.ts`, `tests/unit/gemini.test.ts`, `tests/security/http.test.ts` | `npx vitest run tests/unit/air.test.ts` |
| Secret baked into the deployed bundle | Server config read at request time via dynamic `readEnv()`; no `NEXT_PUBLIC_`; deployment-output and client-bundle gates | `src/lib/env.ts`, `scripts/check-secrets-in-bundle.mjs`, `scripts/check-client-bundles.mjs` | `tests/security/envRuntimeOnly.test.ts` (fails on any literal `process.env.<server var>`) | `npm run check:secrets-in-bundle` (after a build) |
| Secret committed to git | gitleaks over history and working tree; `.env*` ignored | `.gitleaks.toml`, `.gitignore` | gitleaks itself | `npm run secrets` and `npm run secrets:dir` |
| Error/stack leakage | Nine generic error codes; upstream bodies never forwarded; structured logs carry no location or profile | `src/lib/http.ts`, `src/app/api/*/route.ts` | `tests/security/planRoute.test.ts` | `npx vitest run tests/security/planRoute.test.ts` |
| Clickjacking / referrer leakage | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` | `src/lib/security.ts`, `src/proxy.ts` | `tests/security/security.test.ts`, e2e header assertions | `npx vitest run tests/security/security.test.ts` |
| CSP bypass | Per-request nonce, no `unsafe-inline`/`unsafe-eval` in production, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` | `src/lib/security.ts` | `tests/security/security.test.ts`, e2e CSP assertions | `npx vitest run tests/security/security.test.ts` |
| Service worker caching personalised data | `/api/` never intercepted; only same-origin GET outside `/api/` is cached | `public/sw.js` | `tests/e2e/smoke.spec.ts` (Cache Storage assertion), `scripts/smoke.sh` | `npm run test:e2e` |
| Runtime code generation in the browser | `z.config({ jitless: true })`; no `eval`/`new Function`; CSP forbids both | `src/lib/zod-jitless.ts`, `src/lib/security.ts` | `tests/unit/schemas.test.ts`, `tests/security/security.test.ts` | `npm test` |
| Reconnaissance through a status endpoint | `/api/health` returns exactly `{"status":"ok"}`, rate limited and fail-closed | `src/app/api/health/route.ts` | `tests/unit/healthRoute.test.ts` | `npx vitest run tests/unit/healthRoute.test.ts` |
| Vulnerable dependency | Exact pins, committed lockfile, Dependabot weekly, `npm audit` in CI | `package.json`, `package-lock.json`, `.github/dependabot.yml`, `.github/workflows/ci.yml` | `npm audit` | `npm audit --audit-level=low` |

## STRIDE-lite

| Threat | Example | Mitigation (file) |
| --- | --- | --- |
| **S**poofing | Forged client IP to dodge limits | Trusted platform headers only, canonical IP, hashed key (`src/lib/http.ts`) |
| Spoofing | Cross-site POST | Full-origin check against `APP_ORIGIN`/`Host`, `sec-fetch-site`, no CORS (`src/lib/http.ts`) |
| **T**ampering | Invented air data sent to the model | `/api/plan` re-fetches the snapshot server-side (`src/app/api/plan/route.ts`) |
| Tampering | Prompt injection via city name, profile or upstream data | No free text, strict schemas, delimited untrusted blocks, character-set filtering (`src/lib/prompt.ts`) |
| Tampering | XSS via model output | Text-only rendering, sanitisation, nonce CSP (`src/lib/sanitize.ts`) |
| Tampering | Medical advice from the model | Regex guard → fallback (`src/lib/sanitize.ts`, `src/lib/planService.ts`) |
| Tampering | Poisoned service worker | `/api/` never cached; `response.ok && type === 'basic'` only (`public/sw.js`) |
| **R**epudiation | No audit trail of abuse | Minimal structured logs (route, status, duration, outcome), no personal data (`src/lib/http.ts`) |
| **I**nformation disclosure | Key in the bundle | Runtime-only config reads; bundle gates (`src/lib/env.ts`) |
| Information disclosure | Location in logs | Coordinates rounded, never logged or persisted (`src/lib/geo.ts`) |
| **D**enial of service | Flooding the paid route | Two-layer limit, 1.5 s bound, fail closed (`src/lib/rateLimit.ts`) |
| DoS | Oversized body / slow upstream | Streaming 8 KiB cap; 5 s upstream, 18 s model, 25 s budget (`src/lib/http.ts`, `src/lib/constants.ts`) |
| **E**levation of privilege | SSRF | Fixed hosts, numeric params, manual redirect rejection (`src/lib/air.ts`) |
| Elevation of privilege | Runtime code generation | jitless zod, CSP without `unsafe-eval` (`src/lib/zod-jitless.ts`) |

## OWASP Top 10 (2021) mapping

| Category | How it applies here | Evidence |
| --- | --- | --- |
| A01 Broken access control | No accounts or roles; the only privileged action is spending the owner's model quota, gated by origin + rate limit + daily cap | `tests/security/http.test.ts`, `tests/security/productionLimits.test.ts` |
| A02 Cryptographic failures | No stored secrets in the app; HSTS in production; secrets live in the platform's secret store and are read at runtime | `tests/security/security.test.ts`, `npm run check:secrets-in-bundle` |
| A03 Injection | No SQL; JSON parsed with bounded reader; all rendering is text; prompt injection handled by construction (no free text) | `tests/security/http.test.ts`, `tests/security/prompt.test.ts` |
| A04 Insecure design | Deterministic fallback, fail-closed limiter, labelled estimates, no medical advice path | `tests/security/productionLimits.test.ts`, `tests/unit/impact.test.ts` |
| A05 Security misconfiguration | Headers and CSP built in one pure module; startup check names missing variables; no `vercel.json` to drift | `tests/security/security.test.ts`, `tests/unit/envCheck.test.ts` |
| A06 Vulnerable components | Exact pins, lockfile, Dependabot, audit gate, `overrides` for patched transitives | `npm audit --audit-level=low` |
| A07 Identification/auth failures | Out of scope by design: no accounts, no sessions, no passwords | `PRIVACY.md` |
| A08 Software/data integrity failures | Lockfile committed; no dynamic code loading; model output validated against a strict schema | `tests/unit/schemas.test.ts` |
| A09 Logging/monitoring failures | Minimal structured logs; `/api/health` for uptime; startup check for configuration | `tests/unit/healthRoute.test.ts` |
| A10 SSRF | Fixed upstream hosts, numeric-only parameters, manual redirect rejection | `tests/unit/air.test.ts`, `tests/unit/gemini.test.ts` |

## Responsible disclosure

If you find a vulnerability:

1. Email the address in [`/.well-known/security.txt`](https://breathwise-u27mzs.freebuff.site/.well-known/security.txt).
   The repository ships the clearly marked placeholder **`REPLACE_WITH_MY_EMAIL`**;
   the operator must replace it before a real deployment relies on it. No real
   address is invented here.
2. Include the affected URL or file, the steps to reproduce, and the impact you
   observed. Do not include real personal data.
3. Please do not run load tests, automated scanners or denial-of-service tests
   against the public demo; it shares a free-tier model quota.
4. We aim to acknowledge within 5 working days and to ship a fix or a documented
   mitigation within 30 days, and we will credit you in this file if you want.

## Known limitations

- **No third-party audit.** The review above is independent of the code's
  original author but is not an external pen-test.
- **Shared free-tier model quota.** The daily cap limits cost, not availability:
  a determined attacker with many addresses can still exhaust the day's quota.
  The labelled fallback keeps the product usable when that happens.
- **In-memory limiter in development.** It is per instance and does not survive a
  restart. Production refuses to serve without Upstash, which is the control that
  matters.
- **`APP_ORIGIN` is deployment configuration.** A wrong value fails closed (403),
  but it is not verified by a test against the real host — the smoke script does
  that after deployment.
- **CSP is nonce-based, so pages are dynamic.** Accepted tradeoff, documented in
  the header section below.
- **Overrides for transitive packages.** `glob`, `minimatch` and `sharp` are
  forced to patched versions. They are build/dev tooling only; re-check them when
  `wrangler` or `@opennextjs/cloudflare` change.

## Not verified here

Stated plainly rather than implied:

- The deployed production origin was not re-attacked after the dependency upgrade
  in this session; the post-deploy smoke script covers headers, CORS, health and
  the service worker, not a full manual review.
- Real-proxy behaviour (Vercel's header injection) is exercised only through unit
  tests with simulated headers, not against Vercel itself.
- Browser-specific CSP enforcement was checked with Playwright/Chromium only; no
  Safari or Firefox run in this environment.
- Model-provider abuse controls (quota, billing alerts) are the platform's, not
  this repository's, and were not tested.

## Header policy

Set per request in `src/proxy.ts`:

```
default-src 'self';
script-src 'self' 'nonce-<fresh 128-bit>' 'strict-dynamic';
style-src  'self' 'nonce-<fresh>';
img-src 'self' data:; font-src 'self'; connect-src 'self';
manifest-src 'self'; worker-src 'self'; media-src 'none';
object-src 'none'; frame-src 'none'; frame-ancestors 'none';
base-uri 'self'; form-action 'self'; upgrade-insecure-requests
HSTS (prod), X-Content-Type-Options: nosniff, X-Frame-Options: DENY,
Referrer-Policy: no-referrer, Permissions-Policy (geolocation=(self), rest off),
Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Resource-Policy: same-origin
```

Nonces require dynamic rendering, so every route is `ƒ (Dynamic)` and HTML is not
CDN-cached. This is accepted in exchange for `script-src` with no
`'unsafe-inline'`/`'unsafe-eval'` in production. Development adds those because
React Fast Refresh needs them; that is gated on `NODE_ENV`.
