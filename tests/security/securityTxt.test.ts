import { describe, expect, it } from 'vitest';
import { GET } from '@/app/.well-known/security.txt/route';

describe('RFC 9116 security.txt', () => {
  const request = new Request('https://app.example.com/.well-known/security.txt');

  it('serves a plain-text contact file with the required fields', async () => {
    const response = GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');

    const body = await response.text();
    expect(body).toContain('Contact: mailto:PUT_MY_REAL_EMAIL_HERE');
    expect(body).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T/m);
    expect(body).toContain('Preferred-Languages:');
    expect(body).toContain('/.well-known/security.txt');
    expect(body).toContain('Policy:');
  });

  it('contains no secret, configuration value or request echo', async () => {
    const body = await GET(
      new Request('https://app.example.com/.well-known/security.txt?x=<script>'),
    ).text();
    expect(body).not.toMatch(/GEMINI|UPSTASH|token|api[_-]?key/i);
    expect(body).not.toContain('<script>');
    expect(body.toLowerCase()).not.toContain('stack');
  });

  it('is cacheable and not personalised', () => {
    const response = GET(request);
    expect(response.headers.get('cache-control')).toContain('public');
  });
});
