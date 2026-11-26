# Contributing

Thanks for helping. This is a public-health tool, so correctness and honesty
matter more than speed.

## Setup

```bash
npm ci
npm run dev            # http://localhost:3000, works with no API keys
```

No key is required: without `GEMINI_API_KEY` every plan is the deterministic
fallback, and without live air data the app labels the sample snapshot. Copy
`.env.example` to `.env.local` only if you want to exercise the model path.

## Repository layout

```
src/
  app/                  Next.js App Router: pages and route handlers
    api/{air,geocode,health,plan}/   JSON endpoints (each: thin handler + lib calls)
    .well-known/security.txt/        RFC 9116 contact file
  components/           React components, grouped by screen
    air/  app/  chart/  location/  plan/  profile/   one folder per screen area
  hooks/                Client state, one concern per hook
  lib/                  Framework-free logic (server and client)
    planContent/        Reviewed fallback copy, one file per language
    i18n/               UI strings, one file per language
  instrumentation.ts    Startup configuration check
  proxy.ts              Route middleware (security headers)
tests/
  unit/                 Pure logic and component contracts
  security/             Attack-focused checks (guards, limits, key hygiene)
  e2e/                  Real browser: flows and axe accessibility scans
  live/                 Opt-in tests against the real model (never in CI)
scripts/                Build, bundle-budget and Lighthouse tooling
```

## Conventions

- **One job per module.** A file exports either a component, a hook or a set
  of pure functions — not a mixture. Screens compose small components from
  their `components/<area>/` folder; the screen file itself only decides order.
- **Server code never reaches the browser.** Anything that reads `readEnv()`
  lives in `src/lib` and is imported only from `src/app/api/**` or route
  handlers. The guards in `src/lib/responseGuards.ts` exist so the browser can
  validate a response without pulling zod in.
- **Named exports, no default exports.** Components are `PascalCase.tsx`,
  hooks are `use-thing.ts`, everything else is `kebab-case.ts`.
- **JSDoc on every exported function**: what it does, its inputs, and any
  assumption a reader must know (for example that an estimate is a rule of
  thumb). Internal helpers get a one-line comment only when the reason is not
  obvious from the name.
- **Types over casts.** `strict` and `noUncheckedIndexedAccess` are on; there
  are no `any`, no `@ts-ignore` and no non-null assertions. If a value can be
  absent, say so in the type.
- **Size limits are enforced by lint**, not by review: complexity ≤ 10, 60
  lines per function, 320 lines per file. Exceeding one means the unit has more
  than one job.
- **New UI string?** Add it to all three packs in `src/lib/i18n`; the i18n test
  fails if a key is missing.

## Before you open a pull request

```bash
npm run verify   # lint, typecheck, unit tests with coverage, build, bundle scans
npm run test:e2e # Playwright, after a build; needs a Chromium install
```

- Coverage must stay at or above 90% statements/lines/functions and 85% branches
  for `src/lib`. The thresholds are enforced by `npm test`, not by review.
- `npm run lint` runs with `--max-warnings=0`: a warning fails the build just
  like an error.
- `.editorconfig` and `.prettierrc` agree; run `npm run format:check`.
- Add or update a test for every behaviour change. Tests live in `tests/unit`,
  `tests/security` (attack-focused) and `tests/e2e` (real browser).
- Never weaken a control to make a test pass. If a control needs to change,
  change it deliberately, explain why in the pull request, and update
  `SECURITY.md` in the same commit.

## Rules that are not negotiable

1. **No secrets in the repository or the bundle.** Server configuration is read
   at request time through `readEnv()` in `src/lib/env.ts`. A literal
   `process.env.SECRET_NAME` is folded at build time and will be caught by
   `tests/security/envRuntimeOnly.test.ts` and by the bundle gates.
2. **No free-text user input reaches the model.** The profile is enums and small
   integers only. Keep it that way.
3. **No personal data, no accounts, no analytics, no database.** See
   [`PRIVACY.md`](PRIVACY.md).
4. **Every number about impact states its assumption** and is labelled as an
   estimate. Do not invent statistics or cite a source you did not verify.
5. **Never silently use placeholder data.** Sample or fallback data must be
   labelled on screen and in the API response.
6. **Medical safety.** No diagnosis, medication or dosage advice, ever. The
   server-side guard in `src/lib/sanitize.ts` is a backstop, not a licence to
   write medical copy.

## Commits

Small, focused commits with a sentence on _why_. Run `npm run verify` before
committing. Do not commit generated output (`coverage/`, `.next/`,
`freebuff-sites-build/`, `.open-next/`); all of it is gitignored.

## Reporting a vulnerability

Do not open a public issue. Follow the responsible-disclosure process in
[`SECURITY.md`](SECURITY.md#responsible-disclosure) and
`/.well-known/security.txt`.
