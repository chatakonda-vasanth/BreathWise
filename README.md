# Urban Air Quality Assistant — BreathWise (CleanAir Companion)

[![CI](https://github.com/chatakonda-vasanth/BreathWise/actions/workflows/ci.yml/badge.svg)](https://github.com/chatakonda-vasanth/BreathWise/actions/workflows/ci.yml)

> Create a GenAI-powered assistant that helps families and communities navigate severe winter smog and urban air pollution. The application should suggest low-emission daily routines, indoor air quality hacks, and sustainable alternatives tailored to their location and lifestyle, while clearly explaining the direct impact of their choices.

**Live demo:** <https://breathwise-u27mzs.freebuff.site>

**In one sentence.** BreathWise reads public air-quality data for a household's own
area and returns a household-specific plan — low-emission daily routines, indoor
air-quality hacks and sustainable alternatives, each with the direct impact of the
choice spelled out — for families and neighbourhoods. It is privacy-first by
construction: no accounts, no database, no stored location, and no place name ever
sent to the model.

## Problem statement traceability

One row per phrase of the problem statement. Every row names the feature, the
file that implements it and a test that would fail if the feature were removed.

| Statement phrase | How the product implements it | Where it lives | Test that proves it |
|---|---|---|---|
| **GenAI-powered assistant** | A Gemini `generateContent` call with a fixed system prompt, a strict structured-output schema and no tools; a validated model plan, or the labelled rule-based plan on any failure. | `src/lib/gemini.ts`, `src/lib/prompt.ts`, `src/lib/planService.ts`, `src/lib/ask.ts` | `tests/unit/gemini.test.ts`, `tests/unit/planService.test.ts`, `tests/unit/ask.test.ts` |
| **Helps families and communities** | A household quick profile plus a "Community mode" checklist for school, workplace, resident association and neighbourhood. | `src/components/profile-form.tsx`, `src/lib/schemas.ts`, `src/lib/i18n/index.ts` | `tests/unit/schemas.test.ts`, `tests/unit/i18nPacks.test.ts`, `tests/security/keyHygiene.test.ts` |
| **Navigate severe winter smog and urban air pollution** | Both AQI standards are computed locally (US EPA AQI and India CPCB NAQI, worst sub-index wins), with winter inversion and residue-burning windows flagged per coarse region and season. | `src/lib/aqi.ts`, `src/lib/naqi.ts`, `src/lib/regional.ts`, `src/lib/indices.ts` | `tests/unit/aqi.test.ts`, `tests/unit/naqi.test.ts`, `tests/unit/regional.test.ts` |
| **Low-emission daily routines** | School run, commute, mask and exercise guidance, best outdoor window, and travel alternatives chosen from commute mode and budget. | `src/lib/prompt.ts`, `src/lib/planContent/`, `src/lib/gemini.ts` | `tests/unit/fallback.test.ts`, `tests/unit/schemas.test.ts` |
| **Indoor air quality hacks** | 3–8 indoor hacks, each with mechanism, estimated reduction, assumption and confidence; HEPA CADR sizing hint when room size is known. | `src/lib/gemini.ts`, `src/lib/planContent/`, `src/lib/fallbackPlan.ts` | `tests/unit/fallback.test.ts`, `tests/unit/ask.test.ts` |
| **Sustainable alternatives** | 2–6 sustainable alternatives, each with its own direct-impact block. | `src/lib/gemini.ts`, `src/lib/planContent/`, `src/components/plan-view.tsx` | `tests/unit/fallback.test.ts`, `tests/unit/schemas.test.ts` |
| **Tailored to their location** | Air data and both indices come from rounded coordinates; coarse-region + season context is added in the browser; the place name is never sent to the model. | `src/lib/geo.ts`, `src/lib/regional.ts`, `src/lib/air.ts`, `src/app/api/air/route.ts` | `tests/unit/regional.test.ts`, `tests/security/prompt.test.ts` |
| **Tailored to their lifestyle** | The enumerated profile is sent in the prompt, and "Why this plan fits you" names every household input that changed the answer. | `src/lib/schemas.ts`, `src/lib/prompt.ts`, `src/lib/impact.ts` | `tests/unit/impact.test.ts`, `tests/security/prompt.test.ts` |
| **Clearly explaining the direct impact of their choices** | Every recommendation carries a Direct impact block; the plan adds a deterministic with/without estimate labelled "rough estimate" in all three languages. | `src/lib/types.ts`, `src/lib/impact.ts`, `src/components/plan-view.tsx` | `tests/unit/impact.test.ts`, `tests/unit/schemas.test.ts` |

## How the GenAI works

- **Integration:** `src/lib/gemini.ts` is the only module that talks to the model:
  one `fetch`, no SDK, pinned host, API key in `x-goog-api-key`, `toolConfig`
  forced to `NONE`, `redirect: 'manual'`, per-attempt `AbortSignal.timeout`,
  JSON mode plus `responseSchema`.
- **System prompt:** `SYSTEM_INSTRUCTION` in `src/lib/prompt.ts` sets nine hard
  rules (ground claims in supplied data, state assumptions, treat data blocks as
  untrusted, no medical advice, refuse off-topic, no tools, Direct impact on
  every recommendation, prefer free/low-cost, JSON only).
- **Schema:** `RESPONSE_SCHEMA` mirrors `llmPlanSchema` exactly. The
  quick-question path uses a second schema with one key, `answer`.
- **Guardrails:** no free text reaches the model (closed zod enums, 400 on
  unknown fields); medical-advice filter; prompt-injection defence; strict zod
  parse, script check, length caps, sanitisation; same-origin, IP rate limit,
  daily LLM cap, kill switch, time budgets, one retry; honest `generatedBy`
  provenance.
- **Fallback:** `src/lib/fallbackPlan.ts` + `src/lib/planContent/` build a
  complete reviewed plan for six severity bands in English, Hindi and Telugu.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture and
data flow.

## Run it in 3 commands

```bash
npm ci
npm run dev
# open http://localhost:3000
```

No API keys, database or environment variables are needed. Without
`GEMINI_API_KEY` the app serves the labelled rule-based plan; without live air
data it uses an explicitly labelled sample snapshot. Node 20+.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Dev server / production build / serve |
| `npm run lint` | ESLint flat config, complexity ≤ 10 |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest unit + security suites with coverage gates |
| `npm run test:e2e` | Playwright smoke tests (needs a build) |
| `npm run test:a11y` | Axe-based WCAG 2.2 AA checks |
| `npm run audit` | `npm audit` at every severity |
| `npm run secrets` / `secrets:dir` | gitleaks history / working tree |
| `npm run smoke -- <url>` | Post-deploy smoke test |
| `npm run check:bundles` / `check:secrets-in-bundle` | Client and deployment secret scans |
| `npm run verify` | Lint → typecheck → tests → build → bundle scans |

## Evaluation evidence

| Area | Command | Latest real result |
|---|---|---|
| Code quality | `npm run lint && npm run typecheck` | eslint exit 0, tsc exit 0 |
| Testing | `npm test` | 33 test files, 439 tests; coverage 96.47% / 92.51% / 99.62% / 98.36% |
| End-to-end | `npm run build && npm run test:e2e` | 42 Playwright tests passed |
| Security | `npm run test:security` | 10 files, 88 tests passed |
| Supply chain | `npm audit --audit-level=low` | found 0 vulnerabilities |
| Secrets | `npm run secrets` / `secrets:dir` | no leaks |
| Bundle secrets | `npm run check:bundles && npm run check:secrets-in-bundle` | both PASS |
| Deployed production | `npm run smoke -- https://breathwise-u27mzs.freebuff.site` | 12 passed, 0 failed |

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Deployment](docs/DEPLOY.md)
- [Accessibility](docs/ACCESSIBILITY.md)
- [Efficiency](docs/EFFICIENCY.md)
- [Decisions](docs/DECISIONS.md)
- [Problem statement](docs/PROBLEM_STATEMENT.md)

See [CONTRIBUTING.md](CONTRIBUTING.md), [PRIVACY.md](PRIVACY.md) and
[SECURITY.md](SECURITY.md).
