export const supportedLocales = ['en-UG', 'lg-UG'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

const messages = {
  'en-UG': {
    appName: 'ClyCites',
    offline: 'Offline',
    syncPending: 'Changes waiting to sync',
    syncComplete: 'Changes synchronized',
    pilotNotReady: 'Pilot not ready',
    humanReviewRequired: 'Human review required',
  },
  'lg-UG': {
    appName: 'ClyCites',
    offline: 'Tewali mutimbagano',
    syncPending: 'Enkyukakyuka zirindirira okutambuzibwa',
    syncComplete: 'Enkyukakyuka zitambuziddwa',
    pilotNotReady: 'Okugezesa tekunnaba kwetegeka',
    humanReviewRequired: 'Kyetaaga omuntu okukikakasa',
  },
} as const;

export type MessageKey = keyof (typeof messages)['en-UG'];

export const message = (locale: SupportedLocale, key: MessageKey): string => messages[locale][key];

export const formatUgandaCurrency = (
  amountMinor: string | bigint,
  currency = 'UGX',
  locale: SupportedLocale = 'en-UG',
): string =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(BigInt(amountMinor)) / 100);

export const formatKampalaDateTime = (
  value: string | Date,
  locale: SupportedLocale = 'en-UG',
): string =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Kampala',
  }).format(new Date(value));
