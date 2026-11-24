# Item art: the quality bar (owner decision 2026-11-24)

Every shop item, every prize and every future item (frames/decorations, profile effects, room pieces, outfits, held
items, avatars, chest and gift openings) is drawn at the level the owner approved on 2026-11-24: "that level and even
more … while keeping everything smooth and light with speed like Discord". Reference: `src/ui/deco/hq.ts` (Crescent
night, Fanous festival, Laylat al-Qadr). Our own Islamic style, never copied art.

## Look
1. **Illustrations, not borders.** Each item is 1–3 big objects (a moon, a lantern, a dome, a cloud sea) that wrap the
   avatar or scene and spill over its edge. No plain ring with small things stuck on it.
2. **Big.** The main object is 35–50 % of the avatar's size and overlaps it; the face itself stays mostly visible.
3. **Shaded in 3–4 tones**: base gradient, a soft shadow shape (blurred, clipped to the object), a highlight shape,
   a rim light on the lit side, specular dots.
4. **Hue-matched outlines** (gold → `#7a3a06`, clouds → `#4a2f9a`), 3–5 px at the 240 box, not one purple for all.
5. **Light and depth**: blurred glows (`b5`, `b10`) behind lit things, a drop shadow (`ds`) under objects in front,
   back layer + front layer around the avatar, particles (twinkles, rising motes).
6. **Rarity reads at a glance**: common = one object; epic = object + light; legendary = several objects + glow +
   particles; mythic = a whole scene (sky, beams, clouds, moving light) that changes the mood of the avatar.
7. Religious rules hold: no figures of prophets, companions, angels or the unseen; no Quran text in decorations.

## Light build (60 fps on very slow phones, Marwan's Tecno 20 Pro)
1. Every piece is one SVG picture drawn **once** (data URL `<img>`); blur filters cost only that first draw.
2. Movement is CSS **transform / opacity only** (`deco.css` keyframes), never SVG animation, never per-frame JS.
3. Loops are 2 s, 4 s or 8 s (8 s only for slow rising or falling things that fade in and out; a full turn for rotations), so they repeat without a jump.
4. Animate only where one avatar is big: Me, an open profile, the shop preview (`live`). Lists, Ranks rows,
   old-phone mode (`html.lite`) and reduced motion show the still.
5. Full-frame video (WebP / MP4) only for one-off moments (chest and gift openings), never for items worn everywhere.
6. Before shipping a batch: a 60 fps preview video for the owner (raw GitHub link), and the still grid checked at
   list size (36–48 px) so the item still reads small.

## Moments (chests, gifts, unlocks, badges, streak, ranks, the week's gifts, a surah finished)
Every reward moment bursts with the same illustrated flare, richer by rarity (`src/ui/flare.ts`, `flare(host, rarity)`):
a bloom, a shock ring (two from epic), a khatam that turns open, four-pointed sparkles and, from rare up, a wheel of
god rays behind the prize (legendary and mythic keep it turning while the prize is shown; mythic has two wheels in two
colours). Pieces are SVG data-URL images drawn once per rarity; motion is WAAPI transform / opacity only; old-phone
mode throws half the sparkles and keeps the rays still; reduced motion shows none. A new moment calls `flare()` at
its reveal. Moment art uses the shaded `two` / `edge` from `roomHQ.ts`; the gift wrapping is lit and outlined in its
own deep tone (`giftArt.ts`). The launch is Android's / iPhone's own splash with the character icon, redrawn from the
shaded `figure.ts` by `scripts/make-character-icons.py` (also `--ios`, `--splash`).
