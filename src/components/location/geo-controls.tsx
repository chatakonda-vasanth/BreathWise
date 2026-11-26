'use client';

import type { Geolocation } from '@/hooks/use-geolocation';
import { t } from '@/lib/i18n';
import type { Language } from '@/lib/types';
import { Banner } from '../ui';

/**
 * "Use my location" and the states that follow it: an explicit consent card,
 * a progress line, then either the result or a plain-language error.
 *
 * The consent card exists because a browser prompt alone does not tell a reader
 * what the app does with a position.
 */
export function GeoControls({ lang, geo }: { lang: Language; geo: Geolocation }) {
  return (
    <div className="mt-3 no-print">
      <button type="button" className="btn" onClick={geo.request}>
        {t(lang, 'useMyLocation')}
      </button>

      {geo.state === 'consent' ? (
        <div className="mt-3" role="group" aria-labelledby="geo-consent-title">
          <Banner tone="info" title={t(lang, 'geoTitle')}>
            <p id="geo-consent-title">{t(lang, 'geoBody')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={geo.allow}>
                {t(lang, 'allow')}
              </button>
              <button type="button" className="btn" onClick={geo.dismiss}>
                {t(lang, 'deny')}
              </button>
            </div>
          </Banner>
        </div>
      ) : null}

      {geo.state === 'locating' ? (
        <p className="hint mt-2" role="status">
          {t(lang, 'locating')}
        </p>
      ) : null}

      {geo.error ? (
        <p className="mt-2 text-sm font-semibold" role="status">
          {geo.error}
        </p>
      ) : null}
    </div>
  );
}
