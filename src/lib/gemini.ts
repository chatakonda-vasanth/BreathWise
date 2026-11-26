import { DEFAULT_GEMINI_MODEL, GEMINI_HOST, LLM_ATTEMPT_TIMEOUT_MS } from './constants';
import { readEnv } from './env';

/**
 * Gemini generateContent client.
 *
 * Verified against the official docs (ai.google.dev/api/generate-content) at the
 * time of writing: POST /v1beta/models/{model}:generateContent, API key in the
 * `x-goog-api-key` header, JSON output forced with generationConfig
 * `responseMimeType: "application/json"` plus `responseSchema` (OpenAPI subset,
 * upper-case type names in the REST form).
 *
 * No SDK: one fetch keeps the dependency surface (and supply-chain risk) small.
 */

export class LlmError extends Error {
  constructor(
    readonly code:
      'timeout' | 'upstream_error' | 'rate_limited' | 'invalid_output' | 'no_api_key',
  ) {
    super(code);
    this.name = 'LlmError';
  }
}

const SAFE_MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

/**
 * Configured model id, or the built-in default.
 * Never includes the "models/" prefix and is never logged with a key.
 */
export function getModelId(): string {
  const configured = readEnv('GEMINI_MODEL')?.trim();
  if (configured && SAFE_MODEL_ID.test(configured)) return configured;
  return DEFAULT_GEMINI_MODEL;
}

/**
 * Reasoning control, verified against ai.google.dev/gemini-api/docs/thinking:
 * Gemini 3 and later take `thinkingConfig.thinkingLevel` (`low` is supported on
 * every 3.x flash model), while sending it to a 2.5-or-earlier model is an
 * error, and `thinkingBudget` is deprecated for 3+. So ask for low thinking only
 * on 3+/4+ models; anything else gets no thinkingConfig at all.
 *
 * Measured on the real outline prompt: ~17 s at the model default vs ~7 s at
 * `low`, which is what keeps this route inside its 20 s budget.
 */
export function thinkingConfigFor(model: string): Record<string, unknown> {
  const major = Number(/^gemini-(\d+)/i.exec(model)?.[1] ?? '0');
  return major >= 3 ? { thinkingConfig: { thinkingLevel: 'low' } } : {};
}

const STRING = (description: string) => ({ type: 'STRING', description });

const IMPACT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    mechanism: STRING('Why it works.'),
    estimatedReduction: STRING('Estimated effect, as a range or description.'),
    assumption: STRING('The assumption behind that estimate.'),
    confidence: { type: 'STRING', enum: ['High', 'Medium', 'Low'] },
  },
  required: ['mechanism', 'estimatedReduction', 'assumption', 'confidence'],
} as const;

const RECOMMENDATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: STRING('Short action title.'),
    detail: STRING('How to do it, concretely.'),
    impact: IMPACT_SCHEMA,
  },
  required: ['title', 'detail', 'impact'],
} as const;

/** OpenAPI-subset response schema; keeps the model on the exact shape we parse. */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: STRING('One short sentence for today.'),
    whatThisMeans: STRING('Plain-language meaning for this family.'),
    cigaretteEquivalentNote: STRING('Rough cigarette-equivalent with caveat.'),
    bestTimeToGoOut: STRING('Best window today and why.'),
    maskGuidance: STRING('Mask advice for this band.'),
    schoolAndCommute: STRING('School run and commute adjustments.'),
    exerciseTiming: STRING('Exercise timing advice.'),
    indoorHacks: { type: 'ARRAY', items: RECOMMENDATION_SCHEMA },
    sustainableAlternatives: { type: 'ARRAY', items: RECOMMENDATION_SCHEMA },
  },
  required: [
    'headline',
    'whatThisMeans',
    'cigaretteEquivalentNote',
    'bestTimeToGoOut',
    'maskGuidance',
    'schoolAndCommute',
    'exerciseTiming',
    'indoorHacks',
    'sustainableAlternatives',
  ],
} as const;

interface GeminiCandidate {
  content?: { parts?: { text?: string }[] };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
}

/** Join the text parts of the first candidate. */
export function extractText(payload: unknown): string {
  const response = payload as GeminiResponse | null;
  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

export interface CallLlmArgs {
  system: string;
  user: string;
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  /** Response schema; defaults to the full plan schema. */
  schema?: unknown;
}

/** GenerateContent endpoint for a model id that already passed validation. */
function endpointFor(model: string): string {
  return new URL(
    `/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    GEMINI_HOST,
  ).toString();
}

/** Request body: one system turn, one user turn, JSON output, no tools. */
function requestBody(args: CallLlmArgs, model: string): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: args.system }] },
    contents: [{ role: 'user', parts: [{ text: args.user }] }],
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: args.schema ?? RESPONSE_SCHEMA,
      ...thinkingConfigFor(model),
    },
    // No tools, no code execution, no grounding: the model can only answer.
    toolConfig: { functionCallingConfig: { mode: 'NONE' } },
  };
}

/** POST the request, mapping transport failures onto LlmError. */
async function post(
  endpoint: string,
  body: Record<string, unknown>,
  apiKey: string,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      // Portable manual redirect handling: workerd rejects `redirect: 'error'`
      // outright, so a 3xx is returned and rejected below instead.
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new LlmError('timeout');
    }
    throw new LlmError('upstream_error');
  }
}

/** Reject a redirect, a rate limit or any other non-2xx answer. */
function assertUsable(response: Response): void {
  if (response.status >= 300 && response.status < 400) {
    throw new LlmError('upstream_error');
  }
  if (response.status === 429) throw new LlmError('rate_limited');
  if (!response.ok) throw new LlmError('upstream_error');
}

/** Parse the upstream JSON body, never trusting its shape. */
async function readPayload(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new LlmError('upstream_error');
  }
}

/**
 * Call the model and return its raw text (still untrusted).
 *
 * @param args System and user turns, API key, optional model, timeout and schema.
 * @returns The concatenated text of the first candidate.
 * @throws {LlmError} On a missing key, unsafe model id, timeout, redirect, rate
 * limit, non-2xx status, unparseable body or an empty answer.
 */
export async function callGemini(args: CallLlmArgs): Promise<string> {
  const apiKey = args.apiKey.trim();
  if (!apiKey) throw new LlmError('no_api_key');

  const model = args.model ?? getModelId();
  if (!SAFE_MODEL_ID.test(model)) throw new LlmError('upstream_error');

  const response = await post(
    endpointFor(model),
    requestBody(args, model),
    apiKey,
    args.timeoutMs ?? LLM_ATTEMPT_TIMEOUT_MS,
  );
  assertUsable(response);

  const text = extractText(await readPayload(response));
  if (!text) throw new LlmError('invalid_output');
  return text;
}

/** Parse the model's JSON text. Never eval, never repair silently. */
export function parseJsonText(text: string): unknown {
  const trimmed = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new LlmError('invalid_output');
  }
}
