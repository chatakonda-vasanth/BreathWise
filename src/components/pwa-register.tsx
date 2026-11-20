'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker in production only.
 *
 * The worker caches the app shell and static assets; it never intercepts or
 * caches /api/* responses (see public/sw.js).
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* registration failure must never break the app */
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
