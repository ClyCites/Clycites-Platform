'use client';

import { useEffect } from 'react';

export function PwaRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // The worker serves assets cache-first. `next dev` chunk URLs are not content-hashed, so a
    // worker in development keeps serving stale code; remove any that an earlier session installed.
    if (process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_E2E === 'true') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .then(() => caches.keys())
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
      return;
    }
    void navigator.serviceWorker.register('/sw.js');
  }, []);
  return null;
}
