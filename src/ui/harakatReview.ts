// Teachers review the clips learners shared to improve the harakat check (#/learn/review; teachers are
// added by the owner to harakat_reviewers, supabase/migrations/20261111000000_harakat_clips.sql). One clip
// at a time: the word in bold with its neighbours, its sound, what the server and the learner thought, then
// Said right / Wrong haraka / Unclear (+ an optional note). Who shared a clip is never shown.
import './learn.css';
import { supabase } from '../cloud/supabase';
import { account } from '../cloud/auth';
import { loadMeta } from '../data/quran';
import { surahName } from '../i18n';
import { lt } from '../i18n/learn';
import { h, toast } from './dom';
import { icon } from './icons';
import { clipPcm } from '../cloud/clipFiles';

interface Clip { id: number; surah: number; ayah: number; words: string[]; target: number; score: number | null; flagged: boolean; learner: string; audio: string | null; path?: string | null }

function wavUrl(pcm: Uint8Array<ArrayBuffer>): string {
  const head = new DataView(new ArrayBuffer(44));
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) head.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); head.setUint32(4, 36 + pcm.length, true); str(8, 'WAVE'); str(12, 'fmt ');
  head.setUint32(16, 16, true); head.setUint16(20, 1, true); head.setUint16(22, 1, true);
  head.setUint32(24, 16000, true); head.setUint32(28, 32000, true); head.setUint16(32, 2, true); head.setUint16(34, 16, true);
  str(36, 'data'); head.setUint32(40, pcm.length, true);
  return URL.createObjectURL(new Blob([head, pcm], { type: 'audio/wav' }));
}

export async function showHarakatReview(root: HTMLElement): Promise<() => void> {
  root.classList.add('learn', 'lp', 'hk-review');
  const body = h('div', { class: 'hk-body' });
  const counts = h('p', { class: 'muted small hk-counts' });
  root.append(
    h('header', { class: 'lp-top' },
      h('a', { class: 'icon-btn back-btn', href: '#/learn', 'aria-label': lt('learn.backToPath') }, icon('back', 22)),
      h('h1', { class: 'lp-title' }, lt('learn.hkTitle')),
      h('span', { class: 'lp-gap' })),
    counts, body);
  const audio = new Audio();
  let url = '';
  const say = (msg: string) => body.replaceChildren(h('p', { class: 'hk-empty' }, msg));
  if (!account()) { say(lt('learn.helpSignIn')); return () => {}; }
  const sb = await supabase();
  const { data: ok } = await sb.rpc('harakat_is_reviewer');
  if (!ok) { say(lt('learn.hkOnly')); return () => {}; }
  const meta = await loadMeta();
  let queue: Clip[] = [];

  const refreshCounts = async () => {
    const { data } = await sb.rpc('harakat_review_counts');
    if (data) counts.textContent = lt('learn.hkCounts', { open: data.open, mine: data.mine });
  };
  const next = async () => {
    if (!queue.length) {
      const { data, error } = await sb.rpc('harakat_review_queue', { n: 20 });
      if (error) { say(lt('learn.followFailed')); return; }
      queue = (data as Clip[]) ?? [];
    }
    void refreshCounts();
    const c = queue.shift();
    if (!c) { say(lt('learn.hkNone')); return; }
    if (url) URL.revokeObjectURL(url);
    url = '';
    const pcm = await clipPcm(sb, c);
    if (pcm) { url = wavUrl(pcm); audio.src = url; void audio.play().catch(() => {}); }
    const note = h('input', { class: 'search', type: 'text', maxlength: '200', placeholder: lt('learn.hkNote') }) as HTMLInputElement;
    const label = async (l: 'right' | 'wrong' | 'unclear') => {
      const { error } = await sb.rpc('harakat_label', { p_id: c.id, p_label: l, p_note: note.value.trim() || null });
      if (error) { toast(lt('learn.followFailed')); return; }
      void next();
    };
    const m = meta[c.surah - 1];
    body.replaceChildren(h('div', { class: 'hk-card' },
      h('p', { class: 'muted small', dir: 'ltr' }, `${m ? surahName(m) : ''} · ${c.surah}:${c.ayah}`),
      h('p', { class: 'hk-words', dir: 'rtl', lang: 'ar' }, ...c.words.flatMap((w, i) => [i ? ' ' : '', i === c.target ? h('b', {}, w) : h('span', {}, w)])),
      h('button', { class: 'chip', onclick: () => { audio.currentTime = 0; void audio.play().catch(() => {}); } }, '▶ ', lt('learn.listen')),
      h('p', { class: 'muted small' }, [c.flagged ? lt('learn.hkFlagged') : '',
        c.learner !== 'none' ? lt('learn.hkLearner', { x: lt(c.learner === 'right' ? 'learn.hkSaidRight' : 'learn.hkSaidWrong') }) : '']
        .filter(Boolean).join(' · ')),
      h('p', {}, lt('learn.hkAsk')),
      h('div', { class: 'hk-btns' },
        h('button', { class: 'primary', onclick: () => void label('right') }, lt('learn.hkRight')),
        h('button', { class: 'primary hk-wrong', onclick: () => void label('wrong') }, lt('learn.hkWrong')),
        h('button', { class: 'chip', onclick: () => void label('unclear') }, lt('learn.hkUnclear'))),
      note));
  };
  await next();
  return () => { audio.pause(); if (url) URL.revokeObjectURL(url); };
}
