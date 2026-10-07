// Startup capability check: which export path can this device use?
import { SAMPLE_RATE } from '../data/audio';
import { H, W } from './layout';

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
  const cfg: VideoEncoderConfig = { codec, width: W, height: H, framerate: 30, bitrate: 8_000_000 };
  const hw = await VideoEncoder.isConfigSupported({ ...cfg, hardwareAcceleration: 'prefer-hardware' }).catch(() => null);
  if (hw?.supported) return 'hardware';
  const any = await VideoEncoder.isConfigSupported(cfg).catch(() => null);
  return any?.supported ? 'software' : null;
}

async function audioSupport(codec: string): Promise<boolean> {
  const res = await AudioEncoder.isConfigSupported({ codec, sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 128_000 }).catch(() => null);
  return !!res?.supported;
}

async function detect(): Promise<Capabilities> {
  if (!('VideoEncoder' in window) || !('AudioEncoder' in window)) {
    return { rows: [['WebCodecs available', false]], path: null };
  }
  const rows: Capabilities['rows'] = [['WebCodecs available', true]];
  let avc: { codec: string; hw: boolean } | null = null;
  for (const [label, codec] of AVC) {
    const s = await videoSupport(codec);
    rows.push([`${label} (${codec}) 1080×1920`, s ?? false]);
    if (s && !avc) avc = { codec, hw: s === 'hardware' };
  }
  const vp9 = await videoSupport(VP9);
  rows.push([`VP9 fallback 1080×1920`, vp9 ?? false]);
  const aac = await audioSupport('mp4a.40.2');
  const opus = await audioSupport('opus');
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

let cached: Promise<Capabilities> | null = null;
export const capabilities = () => (cached ??= detect());
