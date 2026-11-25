import { describe, expect, it } from 'vitest';
import { hi } from '@/lib/i18n/hi';
import { te } from '@/lib/i18n/te';
import { en, type UiKey } from '@/lib/i18n/en';
import { LANGUAGE_NAMES, loadLanguage, t, tList } from '@/lib/i18n';

/**
 * The language packs are lazy: English ships in the first load, Hindi and
 * Telugu arrive only when selected. That is only safe if a pack is complete and
 * if switching loads it first, so both are asserted here.
 */

describe('language packs', () => {
  it('Hindi and Telugu define exactly the English keys', () => {
    const englishKeys = Object.keys(en).sort();
    expect(Object.keys(hi).sort()).toEqual(englishKeys);
    expect(Object.keys(te).sort()).toEqual(englishKeys);
  });

  it('no translation is a blank string or an empty list', () => {
    for (const pack of [hi, te]) {
      for (const [key, value] of Object.entries(pack)) {
        const filled =
          typeof value === 'string' ? value.trim().length > 0 : value.length > 0;
        expect(filled, `${key} is empty`).toBe(true);
      }
    }
  });

  it('every native name is written in its own script', () => {
    expect(LANGUAGE_NAMES.hi).toMatch(/\p{Script=Devanagari}/u);
    expect(LANGUAGE_NAMES.te).toMatch(/\p{Script=Telugu}/u);
  });

  it('loads Hindi on demand and then renders it', async () => {
    expect(t('hi', 'appName')).toBe(en.appName);
    await loadLanguage('hi');
    expect(t('hi', 'appName')).toBe(hi.appName);
    expect(t('hi', 'appName')).toMatch(/\p{Script=Devanagari}/u);
  });

  it('loads Telugu on demand and then renders it', async () => {
    await loadLanguage('te');
    expect(t('te', 'appName')).toBe(te.appName);
    expect(t('te', 'appName')).toMatch(/\p{Script=Telugu}/u);
  });

  it('keeps list values as lists and joins them for flat titles', async () => {
    await loadLanguage('en');
    const list = tList('en', 'privacyBody');
    expect(list.length).toBeGreaterThan(1);
    expect(t('en', 'privacyBody')).toBe(list.join(' '));
  });

  it('a single value is still returned as a one-item list', async () => {
    await loadLanguage('en');
    expect(tList('en', 'appName')).toEqual([en.appName]);
  });

  it('exposes every key as a string through t()', async () => {
    await loadLanguage('hi');
    for (const key of Object.keys(en) as UiKey[]) {
      expect(typeof t('hi', key)).toBe('string');
    }
  });
});
