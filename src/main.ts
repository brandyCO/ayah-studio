// Starter page: reports whether this device can export MP4 on-device (the riskiest part of
// the plan). Phase 0 replaces this with the studio UI and moves the check into a debug panel.

const W = 1080, H = 1920;

const videoConfigs: [string, VideoEncoderConfig][] = [
  ['H.264 High (1080×1920)', { codec: 'avc1.640028', width: W, height: H, framerate: 30, bitrate: 8_000_000 }],
  ['H.264 Main (1080×1920)', { codec: 'avc1.4d0028', width: W, height: H, framerate: 30, bitrate: 8_000_000 }],
  ['H.264 Baseline (1080×1920)', { codec: 'avc1.42e028', width: W, height: H, framerate: 30, bitrate: 8_000_000 }],
  ['VP9 fallback (1080×1920)', { codec: 'vp09.00.40.08', width: W, height: H, framerate: 30, bitrate: 8_000_000 }],
];

const audioConfigs: [string, AudioEncoderConfig][] = [
  ['AAC audio', { codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels: 2, bitrate: 128_000 }],
  ['Opus audio (fallback)', { codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 }],
];

async function check(): Promise<[string, boolean][]> {
  if (!('VideoEncoder' in window) || !('AudioEncoder' in window)) {
    return [['WebCodecs available', false]];
  }
  const rows: [string, boolean][] = [['WebCodecs available', true]];
  for (const [label, cfg] of videoConfigs) {
    const hw = await VideoEncoder.isConfigSupported({ ...cfg, hardwareAcceleration: 'prefer-hardware' }).catch(() => null);
    const any = hw?.supported ? hw : await VideoEncoder.isConfigSupported(cfg).catch(() => null);
    rows.push([`${label}${hw?.supported ? ' · hardware' : ''}`, !!any?.supported]);
  }
  for (const [label, cfg] of audioConfigs) {
    const res = await AudioEncoder.isConfigSupported(cfg).catch(() => null);
    rows.push([label, !!res?.supported]);
  }
  return rows;
}

check().then((rows) => {
  const table = document.querySelector('#caps')!;
  table.innerHTML = rows
    .map(([label, ok]) => `<tr><td>${label}</td><td class="${ok ? 'ok' : 'no'}">${ok ? 'Yes' : 'No'}</td></tr>`)
    .join('');
});
