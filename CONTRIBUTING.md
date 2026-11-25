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

## Before you open a pull request

```bash
npm run verify   # lint, typecheck, unit tests with coverage, build, bundle scans
npm run test:e2e # Playwright, after a build; needs a Chromium install
```

- Coverage must stay at or above 90% statements/lines/functions and 85% branches
  for `src/lib`. The thresholds are enforced by `npm test`, not by review.
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

Small, focused commits with a sentence on *why*. Run `npm run verify` before
committing. Do not commit generated output (`coverage/`, `.next/`,
`freebuff-sites-build/`, `.open-next/`); all of it is gitignored.

## Reporting a vulnerability

Do not open a public issue. Follow the responsible-disclosure process in
[`SECURITY.md`](SECURITY.md#responsible-disclosure) and
`/.well-known/security.txt`.
