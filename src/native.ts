// The Android app (Capacitor): saving and sharing an exported video. In the WebView `<a download>`
// and navigator.share do nothing, so the file is written with @capacitor/filesystem (in pieces, never
// one huge string) to the public Movies folder, where the gallery shows it, and shared by its URI.
// The plugins are loaded only inside the app; the web build never downloads them.
import { Capacitor, registerPlugin } from '@capacitor/core';

export const isNative = () => Capacitor.isNativePlatform();

/** Our own small native plugin (android/…/MediaScanPlugin.java): adds a written file to the gallery now. */
const MediaScan = registerPlugin<{ scan(o: { path: string; mime: string }): Promise<void> }>('MediaScan');

const CHUNK = 3 * 1024 * 1024; // bytes per write (a multiple of 3: base64 without padding in between)

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export interface SavedFile {
  uri: string;
  /** Where it went, for the user ("Movies/Ayah Studio"). */
  where: string;
}

/** Writes the video to Movies/Ayah Studio (else Documents/Ayah Studio, else the app's own folder). */
export async function saveVideo(blob: Blob, name: string, onProgress?: (f: number) => void): Promise<SavedFile> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  // Android 10 and older need the storage permission for the public folders (11+ doesn't).
  try {
    const p = await Filesystem.checkPermissions();
    if (p.publicStorage !== 'granted') await Filesystem.requestPermissions();
  } catch {
    /* the fallback below still works */
  }
  const targets = [
    { directory: Directory.ExternalStorage, path: `Movies/Ayah Studio/${name}`, where: 'Movies/Ayah Studio' },
    { directory: Directory.Documents, path: `Ayah Studio/${name}`, where: 'Documents/Ayah Studio' },
    { directory: Directory.External, path: name, where: "the app's own folder" },
  ];
  let lastErr: unknown;
  for (const t of targets) {
    try {
      for (let at = 0; at < blob.size || at === 0; at += CHUNK) {
        const data = await base64(blob.slice(at, at + CHUNK));
        if (at === 0) await Filesystem.writeFile({ directory: t.directory, path: t.path, data, recursive: true });
        else await Filesystem.appendFile({ directory: t.directory, path: t.path, data });
        onProgress?.(Math.min(1, (at + CHUNK) / blob.size));
      }
      const { uri } = await Filesystem.getUri({ directory: t.directory, path: t.path });
      if (t.directory !== Directory.External) {
        const path = decodeURIComponent(uri.replace(/^file:\/\//, ''));
        await MediaScan.scan({ path, mime: blob.type.split(';')[0] || 'video/mp4' }).catch((e) => console.warn('Media scan failed', e));
      }
      return { uri, where: t.where };
    } catch (e) {
      console.warn(`Could not save to ${t.where}`, e);
      lastErr = e;
      await Filesystem.deleteFile({ directory: t.directory, path: t.path }).catch(() => {});
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Opens the Android share sheet (Instagram, TikTok, WhatsApp …) for a saved file. */
export async function shareFile(uri: string, title: string) {
  const { Share } = await import('@capacitor/share');
  await Share.share({ files: [uri], dialogTitle: title });
}
