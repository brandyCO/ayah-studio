// A surah's calligraphed name in the mushaf's header frame. Each surah has its own tiny font (public/fonts/suras/,
// made from SuraNames.woff2 by scripts/make-sura-fonts.py, ~1.3 KB instead of the whole 88 KB font): its number typed
// in that font turns into the name. Loaded when first shown, then kept.
const faces = new Map<number, Promise<void>>();

export function loadSuraFont(n: number): Promise<void> {
  if (!faces.has(n)) {
    const url = `${import.meta.env.BASE_URL}fonts/suras/s${String(n).padStart(3, '0')}.woff2`;
    const p = new FontFace(`sn${n}`, `url(${url})`, { display: 'block' }).load().then((f) => void document.fonts.add(f));
    p.catch(() => faces.delete(n));
    faces.set(n, p);
  }
  return faces.get(n)!;
}

export function suraName(n: number): HTMLElement {
  void loadSuraFont(n).catch(() => {});
  const el = document.createElement('span');
  el.className = 'surah-name';
  el.style.fontFamily = `sn${n}`;
  el.textContent = String(n).padStart(3, '0');
  return el;
}
