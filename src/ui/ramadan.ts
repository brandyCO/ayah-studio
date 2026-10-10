// Ramadan mode (docs/together.md T7).
//   First night (or ☰ → Ramadan): a calm full-screen moment — crescent, "Ramadan Mubarak" and a plan:
//   one Khatm, two, or "just keep me company"; alone or with a Khatm circle.
//   Each day: today's portion on the Today card (the pages left over the days left), opening the
//   mushaf on the right page; in the Android app a local reminder shortly before Maghrib (adhan, from
//   the user's location or their own time). Each evening: "Tonight's ayah" — an ayah from today's
//   portion as a reel in the Night mood, one tap away. The last ten nights deepen the night tint.
//   Eid: "Your Ramadan" — days read, Khatms, the ayah returned to most (in the reciter's voice), as a
//   reel with a closing card. Calm: no streaks, no guilt — a missed day just spreads the pages out.
import { ayahAudio } from '../data/audio';
import { draftHash, newDraftId, saveDraft } from '../data/drafts';
import { loadMushaf, type Mushaf } from '../data/mushaf';
import { loadMeta, reference, surahText } from '../data/quran';
import {
  daysToRamadan, mostReturned, PAGES, planPages, ramadanData, ramadanNow, ramadanSettings, setPlan, setRamadanSettings, setRecapSeen,
  setWelcomed, todayPortion, type Plan,
} from '../data/ramadan';
import { DEFAULT_RECITER, reciterById } from '../data/reciters';
import { MOODS, applyMood } from '../engine/moods';
import { applyLook, newProject } from '../engine/project';
import { isNative } from '../native';
import { h, toast } from './dom';
import { lastRead, reelLook, reelReciter } from './prefs';
import { locale, t as tr } from '../i18n';

export interface RamadanContext {
  goToPage(page: number): void;
  openCircles(): void;
}

const CRESCENT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 3.2a9 9 0 1 0 5.3 15.1A7.6 7.6 0 0 1 15.5 3.2z" fill="currentColor"/></svg>';
const crescentBig = () => {
  const el = h('div', { class: 'moment-crescent' });
  el.innerHTML = CRESCENT;
  return el;
};
const plans = (): { value: Plan; label: string; note: string }[] => [
  { value: 'one', label: tr('ram.one'), note: tr('ram.oneNote') },
  { value: 'two', label: tr('ram.two'), note: tr('ram.twoNote') },
  { value: 'company', label: tr('ram.company'), note: tr('ram.companyNote') },
];

type Seg = [number, number, string];
/** The first ayah that begins on a page. */
export function firstAyahOn(m: Mushaf, page: number): { s: number; a: number } {
  const segs = m.pages[page - 1].lines.filter((l) => l[0] !== 'h' && l[0] !== 'b').flat() as Seg[];
  const seg = segs.find((x) => m.segStart.get(x) === 1) ?? segs[0];
  return seg ? { s: seg[0], a: seg[1] } : { s: 1, a: 1 };
}

const ranges = (pages: number[]) => {
  const out: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    out.push(i === j ? `${pages[i]}` : `${pages[i]}–${pages[j]}`);
    i = j;
  }
  return out.join(', ');
};
export async function portionLabel(): Promise<{ text: string; page: number | null } | null> {
  const p = todayPortion();
  if (!p || !p.pages.length) return null;
  const m = await loadMushaf();
  const juz = [...new Set(p.pages.map((x) => m.pages[x - 1].juz))];
  if (!p.left.length) return { text: tr('ram.portionRead'), page: null };
  return { text: tr('ram.portion', { juz: juz.join(' & '), pages: ranges(p.pages), n: p.left.length }), page: p.left[0] };
}

/** Today card lines (registered by the mushaf). */
export async function ramadanToday(ctx: RamadanContext): Promise<{ icon: string; text: string; onClick?(): void }[]> {
  const now = ramadanNow();
  const d = ramadanData(now);
  const items: { icon: string; text: string; onClick?(): void }[] = [];
  if (now.day && d.plan && d.plan !== 'company') {
    const l = await portionLabel();
    if (l) items.push({ icon: '☾', text: tr('ram.todaysPortion', { text: l.text }), onClick: () => (l.page ? ctx.goToPage(l.page) : openRamadan(ctx)) });
  }
  if (now.day && !d.plan) items.push({ icon: '☾', text: tr('ram.choose'), onClick: () => openRamadan(ctx) });
  if (now.day && new Date().getHours() >= 16) {
    const t = await tonightsAyah();
    const meta = await loadMeta();
    items.push({ icon: '✧', text: tr('ram.tonight', { ref: reference(meta[t.s - 1], t.a, t.a) }), onClick: () => void tonightsReel() });
  }
  if (now.eid && (d.days.length || d.khatms)) items.push({ icon: '☾', text: tr('ram.eidYours'), onClick: () => void openRecap() });
  return items;
}

/** An ayah from today's portion (or, keeping company, from the page last read). */
async function tonightsAyah(): Promise<{ s: number; a: number }> {
  const m = await loadMushaf();
  const p = todayPortion();
  let page = p?.pages.length ? p.pages[Math.floor(p.pages.length / 2)] : 0;
  if (!page) {
    const last = /^#\/s\/(\d+)(?:\/(\d+))?/.exec(lastRead());
    page = last ? m.pageOf(Number(last[1]), Number(last[2]) || 1) : 1;
  }
  return firstAyahOn(m, page);
}

async function newReel(s: number, a: number, setup: (p: ReturnType<typeof newProject>) => void) {
  const p = newProject(s, a, a, reciterById(reelReciter(DEFAULT_RECITER)).id);
  applyLook(p, reelLook(), () => true);
  setup(p);
  const id = newDraftId();
  const now = Date.now();
  await saveDraft({ id, project: p, created: now, updated: now });
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((x) => x.close());
  location.hash = draftHash(p, id);
}
async function tonightsReel() {
  const t = await tonightsAyah();
  await newReel(t.s, t.a, (p) => applyMood(p, MOODS.find((m) => m.id === 'night')!));
}

// --- full-screen moments ---
function moment(cls: string, ...content: (Node | string | false)[]) {
  const d = h('dialog', { class: `moment ${cls}` }, ...content);
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
  return d;
}

/** The first night: Ramadan Mubarak and a plan. */
export function ramadanWelcome(ctx: RamadanContext) {
  const pick = (plan: Plan) => {
    setPlan(plan);
    d.close();
    void scheduleReminders();
    void portionLabel().then((l) => toast(plan === 'company' ? tr('ram.companyToast') : l ? tr('ram.today', { text: l.text }) : tr('ram.mubarak')));
  };
  const d = moment('ramadan-welcome',
    crescentBig(),
    h('h2', {}, tr('ram.mubarak')),
    h('p', { class: 'moment-sub' }, tr('ram.how')),
    h('div', { class: 'moment-choices' }, ...plans().map((p) => h('button', { class: 'moment-choice', onclick: () => pick(p.value) }, h('b', {}, p.label), h('span', {}, p.note)))),
    h('button', { class: 'link-btn moment-link', onclick: () => { setWelcomed(); d.close(); ctx.openCircles(); } }, tr('ram.together')),
    h('button', { class: 'link-btn moment-skip', onclick: () => { setWelcomed(); d.close(); } }, tr('ram.notNow')));
}

/** Eid: Your Ramadan. */
export async function openRecap() {
  const now = ramadanNow();
  const d = ramadanData(now);
  setRecapSeen();
  const meta = await loadMeta();
  const most = mostReturned(d);
  let ayahBlock: Node = h('span');
  let audio: { ctx: AudioContext; src: AudioBufferSourceNode } | null = null;
  if (most) {
    const [s, a] = most;
    const text = (await surahText(s))[a - 1];
    const listen = h('button', { class: 'chip', onclick: async () => {
      if (audio) { audio.src.stop(); audio = null; listen.textContent = '▶ Listen'; return; }
      listen.textContent = tr('common.loading');
      try {
        const buf = await ayahAudio(reciterById(reelReciter(DEFAULT_RECITER)), s, a);
        const ctx = new AudioContext();
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.onended = () => { audio = null; listen.textContent = '▶ Listen'; void ctx.close(); };
        src.start();
        audio = { ctx, src };
        listen.textContent = '■ Stop';
      } catch {
        listen.textContent = '▶ Listen';
        toast(tr('kids.loadFailed'));
      }
    } }, tr('today.listen'));
    ayahBlock = h('div', { class: 'recap-ayah' },
      h('p', { class: 'moment-sub' }, tr('ram.returnedMost')),
      h('p', { class: 'recap-ar', dir: 'rtl', lang: 'ar' }, text),
      h('p', { class: 'muted' }, reference(meta[s - 1], a, a)),
      listen);
  }
  const days = d.days.length;
  const dlg = moment('ramadan-recap',
    crescentBig(),
    h('h2', {}, tr('ram.yours')),
    h('p', { class: 'recap-line' }, days ? tr(days === 1 ? 'ram.days1' : 'ram.days', { n: days }) : tr('ram.eid')),
    d.khatms ? h('p', { class: 'recap-line' }, d.khatms === 1 ? tr('ram.khatm1Complete') : tr('ram.khatmsComplete', { n: d.khatms })) : '',
    ayahBlock,
    h('div', { class: 'moment-actions' },
      most ? h('button', { class: 'primary brand-btn', onclick: () => {
        const [s, a] = most;
        void newReel(s, a, (p) => {
          applyMood(p, MOODS.find((m) => m.id === 'gold')!);
          p.outro = true;
          const lines = [days ? tr(days === 1 ? 'ram.reelDays1' : 'ram.reelDays', { n: days }) : '', d.khatms ? (d.khatms === 1 ? tr('ram.one') : tr('ram.khatms', { n: d.khatms })) : ''].filter(Boolean);
          p.closing = { title: tr('ram.reelTitle', { year: now.year }).slice(0, 80), names: lines };
        });
      } }, tr('ram.makeReel')) : '',
      h('button', { class: 'chip', onclick: () => dlg.close() }, tr('common.close'))));
  dlg.addEventListener('close', () => { if (audio) { audio.src.stop(); void audio.ctx.close(); } });
}

// --- ☰ → Ramadan ---
export function openRamadan(ctx: RamadanContext) {
  const body = h('div', { class: 'ramadan' });
  const d = h('dialog', { class: 'sheet bottom ramadan-sheet' },
    h('div', { class: 'sheet-head' }, h('h2', {}, `☾ ${tr('ram.ramadan')}`), h('button', { class: 'icon-btn', 'aria-label': tr('common.close'), onclick: () => d.close() }, '✕')), body);
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);

  async function draw() {
    const now = ramadanNow();
    const data = ramadanData(now);
    const st = ramadanSettings();
    const status = now.day
      ? `${tr('ram.dayOf', { day: now.day, n: now.length })}${now.lastTen ? ` · ${tr('ram.lastTen')}` : ''}`
      : now.eid ? tr('ram.eid') : (() => { const n = daysToRamadan(); return n ? tr('ram.beginsIn', { n }) : tr('ram.mode'); })();
    const portion = await portionLabel();
    const total = planPages(data.plan);
    const done = data.khatms * PAGES + data.read.length;
    const nodes: (Node | string)[] = [
      h('p', { class: 'ramadan-status' }, status),
      h('p', { class: 'circle-sub' }, tr('ram.plan')),
      h('div', { class: 'ramadan-plans' }, ...plans().map((p) => h('button', {
        class: `chip${data.plan === p.value ? ' on' : ''}`, 'aria-pressed': String(data.plan === p.value),
        onclick: () => { setPlan(data.plan === p.value ? null : p.value); void scheduleReminders(); void draw(); },
      }, p.label))),
    ];
    if (now.day && portion) {
      nodes.push(h('div', { class: 'ramadan-today' },
        h('div', {}, h('b', {}, tr('mushaf.today')), h('div', { class: 'muted small' }, portion.text)),
        portion.page ? h('button', { class: 'primary brand-btn', onclick: () => { d.close(); ctx.goToPage(portion.page!); } }, tr('ram.open')) : ''));
    }
    if (total) nodes.push(h('p', { class: 'muted small' }, tr('ram.pagesRead', { n: Math.min(done, total), total })));
    nodes.push(h('button', { class: 'chip', onclick: () => { d.close(); ctx.openCircles(); } }, `◯ ${tr('ram.together')}`));

    // Reminder before Maghrib (Android app: local notifications).
    nodes.push(h('p', { class: 'circle-sub' }, tr('ram.reminder')));
    if (!isNative()) {
      nodes.push(h('p', { class: 'muted small' }, tr('ram.reminderWeb')));
    } else {
      const r = st.reminder;
      const save = (patch: Partial<typeof r>) => {
        setRamadanSettings({ ...ramadanSettings(), reminder: { ...ramadanSettings().reminder, ...patch } });
        void scheduleReminders().then((msg) => { if (msg) toast(msg); });
        void draw();
      };
      const time = h('input', { type: 'time', class: 'search', value: r.time, 'aria-label': tr('ram.maghribTime'), onchange: (e: Event) => save({ time: (e.target as HTMLInputElement).value || '18:00', lat: null, lng: null }) });
      nodes.push(
        h('label', { class: 'ramadan-switch' }, h('input', { type: 'checkbox', checked: r.on, onchange: async (e: Event) => {
          const on = (e.target as HTMLInputElement).checked;
          if (on && !(await notificationsAllowed())) { toast(tr('ram.allowNotif')); return void draw(); }
          save({ on });
        } }), ` ${tr('ram.remindMe')}`),
        r.on ? h('div', { class: 'ramadan-reminder' },
          h('p', { class: 'small' }, r.lat !== null ? tr('ram.fromLocation') : tr('ram.maghribAt', { time: r.time })),
          h('div', { class: 'row' },
            h('button', { class: 'chip', onclick: () => locate(save) }, `⌖ ${tr('ram.useLocation')}`),
            time,
            h('select', { class: 'search', 'aria-label': tr('ram.howLong'), onchange: (e: Event) => save({ before: Number((e.target as HTMLSelectElement).value) }) },
              ...[10, 15, 30, 60].map((m) => h('option', { value: String(m), selected: r.before === m }, tr('ram.minBefore', { n: m })))))) : '');
    }

    // Moon sighting and a preview to try the mode out of season.
    nodes.push(h('p', { class: 'circle-sub' }, tr('ram.dates')),
      h('div', { class: 'row' },
        h('span', { class: 'small muted' }, tr('ram.moon')),
        ...([-1, 0, 1] as const).map((k) => h('button', { class: `chip${st.shift === k ? ' on' : ''}`, onclick: () => { setRamadanSettings({ ...ramadanSettings(), shift: k }); void scheduleReminders(); void draw(); } },
          k === 0 ? tr('ram.ummAlQura') : k < 0 ? tr('ram.dayEarlier') : tr('ram.dayLater')))),
      h('label', { class: 'small muted ramadan-preview' }, `${tr('ram.preview')} `,
        h('select', { class: 'search', onchange: (e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          setRamadanSettings({ ...ramadanSettings(), preview: v === 'off' ? null : v === 'eid' ? 'eid' : Number(v) });
          void draw();
        } }, ...[['off', tr('ram.pvOff')], ['1', tr('ram.pvNight', { n: 1 })], ['10', tr('ram.pvDay', { n: 10 })], ['27', tr('ram.pvNight', { n: 27 })], ['eid', tr('ram.pvEid')]].map(([v, l]) =>
          h('option', { value: v, selected: String(st.preview ?? 'off') === v }, l)))));
    if (now.eid) nodes.push(h('button', { class: 'chip', onclick: () => { d.close(); void openRecap(); } }, `☾ ${tr('ram.yours')}`));
    body.replaceChildren(...nodes);
  }
  const onChange = () => void draw();
  window.addEventListener('ramadan-changed', onChange);
  d.addEventListener('close', () => { window.removeEventListener('ramadan-changed', onChange); d.remove(); });
  void draw().then(() => d.showModal());
}

function locate(save: (p: { lat: number; lng: number }) => void) {
  if (!navigator.geolocation) return toast(tr('ram.noLocation'));
  toast(tr('ram.finding'));
  navigator.geolocation.getCurrentPosition(
    // Rounded: the reminder needs the town, not the street.
    (pos) => save({ lat: Math.round(pos.coords.latitude * 100) / 100, lng: Math.round(pos.coords.longitude * 100) / 100 }),
    () => toast(tr('ram.locationDenied')),
    { maximumAge: 6 * 3600_000, timeout: 15_000 });
}

// --- local reminders (Android app) ---
const IDS = Array.from({ length: 31 }, (_, i) => 7100 + i);
async function notificationsAllowed(): Promise<boolean> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  let p = await LocalNotifications.checkPermissions();
  if (p.display !== 'granted') p = await LocalNotifications.requestPermissions();
  return p.display === 'granted';
}

/** The local reminder time for a date: Maghrib (from the location, or the user's time) minus the lead. */
async function reminderAt(date: Date): Promise<Date> {
  const r = ramadanSettings().reminder;
  let maghrib: Date;
  if (r.lat !== null && r.lng !== null) {
    const { Coordinates, CalculationMethod, PrayerTimes } = await import('adhan');
    maghrib = new PrayerTimes(new Coordinates(r.lat, r.lng), date, CalculationMethod.UmmAlQura()).maghrib;
  } else {
    const [hh, mm] = r.time.split(':').map(Number);
    maghrib = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hh || 18, mm || 0);
  }
  return new Date(maghrib.getTime() - r.before * 60_000);
}

let listening = false;
/** (Re)schedules the reminders for the rest of Ramadan; returns a line about the next one. */
export async function scheduleReminders(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    if (!listening) {
      listening = true;
      await LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
        const hash = e.notification.extra?.hash;
        if (typeof hash === 'string' && hash.startsWith('#/')) location.hash = hash;
      });
    }
    await LocalNotifications.cancel({ notifications: IDS.map((id) => ({ id })) });
    const st = ramadanSettings();
    const now = ramadanNow();
    const data = ramadanData(now);
    if (!st.reminder.on || !data.plan || st.preview !== null) return null;
    const portion = await portionLabel();
    const list = [];
    const today = new Date();
    // From today to the end of Ramadan (or, before it starts, its first days once they are near).
    const start = now.day ?? (() => { const n = daysToRamadan(); return n && n <= 3 ? 1 - n : null; })();
    if (start === null) return null;
    for (let day = start; day <= now.length; day++) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (day - (now.day ?? start)));
      if (day < 1) continue;
      const at = await reminderAt(date);
      if (at.getTime() < Date.now() + 60_000) continue;
      const isToday = day === now.day;
      list.push({
        id: IDS[day], title: tr('ram.notifTitle', { day }),
        body: data.plan === 'company' ? tr('ram.notifCompany')
          : isToday && portion?.page ? tr('ram.notifPortion', { text: portion.text }) : tr('ram.notifWaiting'),
        schedule: { at, allowWhileIdle: true }, extra: { hash: '#/ramadan' },
      });
    }
    if (!list.length) return null;
    await LocalNotifications.schedule({ notifications: list });
    const next = list[0].schedule.at;
    return tr('ram.nextReminder', { day: next.toDateString() === today.toDateString() ? tr('ram.todayWord') : next.toLocaleDateString(locale(), { weekday: 'long' }), time: next.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) });
  } catch (e) {
    console.warn('Ramadan reminders could not be scheduled', e);
    return null;
  }
}

/** `#/ramadan` (a reminder was tapped): the mushaf on the next page of today's portion. */
export async function ramadanTarget(): Promise<string> {
  const l = await portionLabel();
  const m = await loadMushaf();
  if (l?.page) {
    const f = firstAyahOn(m, l.page);
    return `#/s/${f.s}/${f.a}`;
  }
  return lastRead();
}
