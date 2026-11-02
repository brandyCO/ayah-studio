// Crash and error reports (Sentry), switched off until a DSN is set: the repo variable SENTRY_DSN is
// passed to the Pages and Android builds as VITE_SENTRY_DSN. Without it the Sentry code is never
// downloaded. Reports carry the error, the app version and the device/browser, never the user's
// account, notes, drafts, cookies or request details (dataCollection off), and no session replays.

const DSN: string = import.meta.env.VITE_SENTRY_DSN || '';

export const errorReportsOn = () => !!DSN;

export function initErrors() {
  if (!DSN || !import.meta.env.PROD) return;
  const start = () => void import('@sentry/browser').then((Sentry) => {
    Sentry.init({
      dsn: DSN,
      release: __DATA_VERSION__,
      environment: location.protocol === 'https:' && location.hostname.endsWith('github.io') ? 'web' : 'app',
      // No user details, cookies, headers, query strings or bodies.
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
      tracesSampleRate: 0,
      // A share of the error reports is plenty to see a problem, and keeps a large crowd within the
      // free plan. VITE_SENTRY_RATE (0–1) changes it; default 0.25.
      sampleRate: Math.min(1, Math.max(0, Number(import.meta.env.VITE_SENTRY_RATE) || 0.25)),
      // Addresses can hold a draft id or a page: keep only the screen ("#/reel", "#/s").
      beforeSend(event) {
        if (event.request?.url) event.request.url = event.request.url.replace(/#\/([a-z]+).*/, '#/$1');
        return event;
      },
      beforeBreadcrumb: (b) => (b.category === 'navigation' || b.category === 'ui.click' ? null : b),
    });
  }).catch(() => { /* offline: no reports this time */ });
  // After the first screen, so it never slows the start.
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 5000 });
  else setTimeout(start, 3000);
}
