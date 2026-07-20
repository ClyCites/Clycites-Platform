'use client';

import { useEffect } from 'react';

export function PwaRegistration() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E !== 'true' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js');
    }
  }, []);
  return null;
}
