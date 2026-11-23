// Shared links (https://<site>/i/#/route, src/native.ts shareableLink) open the installed app: iPhone Universal
// Links and Android App Links hand the URL to the app, @capacitor/app reports it, and this moves the app to
// the route it carries. Runs when imported (main.ts, apps only). The store page's Android intent sends the route as `?r=` instead of the fragment.
import { PUBLIC_URL } from './cloud/config';
import { isNative } from './native';

/** The app route in a shared link, or null. */
export function routeOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.host !== new URL(PUBLIC_URL).host || !/^\/i(\/|$)/.test(u.pathname)) return null;
    const r = u.hash.startsWith('#/') ? u.hash : u.searchParams.get('r') ?? '';
    return r.startsWith('#/') ? r : null;
  } catch {
    return null;
  }
}

const open = (url?: string) => {
  const r = url ? routeOf(url) : null;
  if (r && location.hash !== r) location.hash = r;
};

async function initAppLinks() {
  if (!isNative()) return;
  const { App } = await import('@capacitor/app');
  void App.addListener('appUrlOpen', (e) => open(e.url));
  open((await App.getLaunchUrl().catch(() => undefined))?.url);
}

void initAppLinks();
