// Which export path can this device use? Asked only when it is needed (an export, the device check):
// each isConfigSupported() call can hold the page for a few hundred ms on a phone. The path found is
// remembered for this browser version, so later studios and exports skip the check.
import { SAMPLE_RATE } from '../data/audio';

export interface ExportPath {
  container: 'mp4' | 'webm';
  videoCodec: 'avc' | 'vp9';
  fullCodecString: string;
  hardware: boolean;
  audioCodec: 'aac' | 'opus';
  aacPolyfill: boolean; // AAC via the WASM encoder because AudioEncoder lacks AAC
}

export interface Capabilities {
  rows: [string, boolean | string][];
  path: ExportPath | null;
}

const AVC = [
  ['H.264 High', 'avc1.640028'],
  ['H.264 Main', 'avc1.4d0028'],
  ['H.264 Baseline', 'avc1.42e028'],
] as const;
const VP9 = 'vp09.00.40.08';

async function videoSupport(codec: string): Promise<'hardware' | 'software' | null> {
  const cfg: VideoEncoderConfig = { codec, width: 1080, height: 1920, framerate: 30, bitrate: 8_000_000 };
  const hw = await VideoEncoder.isConfigSupported({ ...cfg, hardwareAcceleration: 'prefer-hardware' }).catch(() => null);
  if (hw?.supported) return 'hardware';
  const any = await VideoEncoder.isConfigSupported(cfg).catch(() => null);
  return any?.supported ? 'software' : null;
}

async function audioSupport(codec: string): Promise<boolean> {
  const res = await AudioEncoder.isConfigSupported({ codec, sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 128_000 }).catch(() => null);
  return !!res?.supported;
}

async function detect(full: boolean): Promise<Capabilities> {
  if (!('VideoEncoder' in window) || !('AudioEncoder' in window)) {
    return { rows: [['WebCodecs available', false]], path: null };
  }
  const rows: Capabilities['rows'] = [['WebCodecs available', true]];
  let avc: { codec: string; hw: boolean } | null = null;
  for (const [label, codec] of AVC) {
    const s = await videoSupport(codec);
    rows.push([`${label} (${codec}) 1080×1920`, s ?? false]);
    if (s && !avc) avc = { codec, hw: s === 'hardware' };
    if (avc && !full) break; // the export only needs the first one that works
  }
  const vp9 = avc && !full ? null : await videoSupport(VP9);
  if (full || !avc) rows.push([`VP9 fallback 1080×1920`, vp9 ?? false]);
  const aac = avc || full ? await audioSupport('mp4a.40.2') : false;
  const opus = !avc || full ? await audioSupport('opus') : false;
  rows.push(['AAC audio (native)', aac], ['Opus audio', opus]);

  let path: ExportPath | null = null;
  if (avc) {
    path = { container: 'mp4', videoCodec: 'avc', fullCodecString: avc.codec, hardware: avc.hw, audioCodec: 'aac', aacPolyfill: !aac };
  } else if (vp9 && opus) {
    path = { container: 'webm', videoCodec: 'vp9', fullCodecString: VP9, hardware: vp9 === 'hardware', audioCodec: 'opus', aacPolyfill: false };
  }
  rows.push(['Export path', path ? describePath(path) : 'none — export not supported on this browser']);
  return { rows, path };
}

export function describePath(p: ExportPath): string {
  return p.container === 'mp4'
    ? `MP4 · ${p.fullCodecString}${p.hardware ? ' (hardware)' : ''} · AAC${p.aacPolyfill ? ' (WASM encoder)' : ''}`
    : `WebM · VP9${p.hardware ? ' (hardware)' : ''} · Opus`;
}

const KEY = 'exportPath';
/** The path found before in this browser version, without asking the encoders again (undefined = not known). */
export function knownPath(): ExportPath | null | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { ua: string; path: ExportPath | null } | null;
    if (v && v.ua === navigator.userAgent) return v.path;
  } catch { /* private window */ }
  return undefined;
}
let cached: Promise<Capabilities> | null = null;
let cachedFull: Promise<Capabilities> | null = null;
/** The export path (only the checks needed to find it; remembered). `full` = every row, for the device check. */
export const capabilities = (full = false): Promise<Capabilities> => {
  if (full) return (cachedFull ??= detect(true));
  if (cached) return cached;
  const known = knownPath();
  if (known !== undefined) return (cached = Promise.resolve({ rows: [], path: known }));
  return (cached = detect(false).then((c) => {
    try { localStorage.setItem(KEY, JSON.stringify({ ua: navigator.userAgent, path: c.path })); } catch { /* private window */ }
    return c;
  }));
};
