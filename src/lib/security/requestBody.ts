import { MAX_BODY_BYTES } from '@/lib/shared/constants';
import { fail, ok, type Result } from '@/lib/shared/result';

/**
 * Bounded request-body reading.
 *
 * Separate from the response helpers because the stream handling — and the
 * cap that makes it safe — is worth reading on its own.
 */

type BodyError = 'too_large' | 'invalid_json' | 'unsupported_media_type';
export type BodyResult = Result<unknown, BodyError>;

type TextError = 'too_large' | 'invalid_json';
type TextResult = Result<string, TextError>;

/**
 * Read at most `maxBytes` from the request stream and cancel the rest.
 *
 * Buffering the whole body first (`request.text()`) and checking the length
 * afterwards would let a chunked request with no Content-Length allocate far
 * past the cap before the check ran. The reader stops the moment the cap is
 * crossed, so the bytes past it never reach memory.
 *
 * @param request Incoming request, possibly without a streaming body.
 * @param maxBytes Hard cap in bytes.
 * @returns The decoded text, or the reason it was rejected.
 */
async function readBoundedText(request: Request, maxBytes: number): Promise<TextResult> {
  const body = streamOf(request);
  // A runtime without a streaming body still gets the length check, just after
  // buffering.
  if (!body || typeof body.getReader !== 'function')
    return readBuffered(request, maxBytes);
  return readStream(body, maxBytes);
}

/** The request body stream, or null when the runtime does not expose one. */
function streamOf(request: Request): ReadableStream<Uint8Array> | null {
  try {
    return request.body;
  } catch {
    return null;
  }
}

/** Fallback for a runtime without streams: buffer once, then check the size. */
async function readBuffered(request: Request, maxBytes: number): Promise<TextResult> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return fail('invalid_json');
  }
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return fail('too_large');
  }
  return ok(text);
}

/** Read a stream chunk by chunk, stopping as soon as the cap is crossed. */
async function readStream(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<TextResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return fail('too_large');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    await reader.cancel().catch(() => undefined);
    return fail('invalid_json');
  }

  return ok(text);
}

/** The exact media type of a header value, lower-cased, without parameters. */
function mediaTypeOf(header: string | null): string {
  return (header ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/** True when the declared Content-Length already proves the body is too big. */
function declaredTooLarge(request: Request, maxBytes: number): boolean {
  const declared = Number(request.headers.get('content-length') ?? '0');
  return Number.isFinite(declared) && declared > maxBytes;
}

/**
 * Bounded JSON body reader. Rejects oversized bodies before parsing, and stops
 * reading (cancelling the stream) as soon as the cap is crossed.
 *
 * @param request Incoming request whose body must be JSON.
 * @param maxBytes Hard cap in bytes; defaults to the app-wide limit.
 * @returns The parsed JSON value, or the reason the body was rejected.
 */
export async function readJsonBody(
  request: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<BodyResult> {
  // Compare the media type exactly. A substring test accepts nonsense such as
  // `text/plain; x=application/json`; the body must really be JSON.
  if (mediaTypeOf(request.headers.get('content-type')) !== 'application/json') {
    return fail('unsupported_media_type');
  }
  if (declaredTooLarge(request, maxBytes)) return fail('too_large');

  const read = await readBoundedText(request, maxBytes);
  if (!read.ok) return read;

  try {
    return ok(JSON.parse(read.value) as unknown);
  } catch {
    return fail('invalid_json');
  }
}
