// Android notification channel names in the app's language. The channels are listed in the phone's
// notification settings; the local-notifications plugin creates its own one as "Default" on every
// start, so it is renamed here afterwards (creating a channel that exists only updates its name).
import { t } from '../i18n';

export async function nameChannels() {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.createChannel({ id: 'default', name: t('notif.channel'), description: t('notif.channel'), importance: 3 });
  } catch {
    /* an older build or notifications off */
  }
}
