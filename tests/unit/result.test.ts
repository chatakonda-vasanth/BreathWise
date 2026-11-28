import { describe, expect, it } from 'vitest';
import { fail, ok } from '@/lib/shared/result';

describe('Result helpers', () => {
  it('wraps a success with its value', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it('wraps a failure with its reason', () => {
    expect(fail('too_large')).toEqual({ ok: false, reason: 'too_large' });
  });
});
